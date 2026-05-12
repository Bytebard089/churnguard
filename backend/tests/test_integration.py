# backend/tests/test_integration.py
# ─────────────────────────────────────────────────────────────────
# Integration tests — require real model files in backend/models/.
# NOT run in CI (they're excluded in ci.yml).
# Run locally with: pytest tests/test_integration.py -v
# ─────────────────────────────────────────────────────────────────

import sys
from pathlib import Path

import pytest

# Make sure backend/ is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

# ── sample payload ──────────────────────────────────────────────
SAMPLE_CUSTOMER = {
    "tenure": 24,
    "MonthlyCharges": 79.5,
    "TotalCharges": 1908.0,
    "gender": "Male",
    "SeniorCitizen": "No",
    "Partner": "Yes",
    "Dependents": "No",
    "PhoneService": "Yes",
    "MultipleLines": "No",
    "InternetService": "Fiber optic",
    "OnlineSecurity": "No",
    "OnlineBackup": "Yes",
    "DeviceProtection": "No",
    "TechSupport": "No",
    "StreamingTV": "Yes",
    "StreamingMovies": "Yes",
    "Contract": "Month-to-month",
    "PaperlessBilling": "Yes",
    "PaymentMethod": "Electronic check",
}


@pytest.fixture(scope="module")
def client():
    """Create a TestClient with the FastAPI app — requires model files."""
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        yield c


# ── /health ──────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_status_is_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_contains_models_loaded(self, client):
        data = client.get("/health").json()
        assert data["models_loaded"] == 5

    def test_health_contains_oof_auc(self, client):
        data = client.get("/health").json()
        assert 0.7 < data["oof_auc"] < 1.0


# ── /sample ──────────────────────────────────────────────────────

class TestSample:
    def test_sample_returns_200(self, client):
        assert client.get("/sample").status_code == 200

    def test_sample_has_required_fields(self, client):
        data = client.get("/sample").json()
        for field in ["tenure", "MonthlyCharges", "Contract", "InternetService"]:
            assert field in data, f"Missing field: {field}"


# ── /predict ─────────────────────────────────────────────────────

class TestPredict:
    def test_predict_returns_200(self, client):
        assert client.post("/predict", json=SAMPLE_CUSTOMER).status_code == 200

    def test_predict_probability_in_range(self, client):
        prob = client.post("/predict", json=SAMPLE_CUSTOMER).json()["churn_probability"]
        assert 0.0 <= prob <= 1.0

    def test_predict_risk_tier_valid(self, client):
        tier = client.post("/predict", json=SAMPLE_CUSTOMER).json()["risk_tier"]
        assert tier in {"High", "Medium", "Low"}

    def test_predict_churn_prediction_is_bool(self, client):
        assert isinstance(client.post("/predict", json=SAMPLE_CUSTOMER).json()["churn_prediction"], bool)

    def test_predict_shap_values_present(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert isinstance(data["shap_values"], list)
        assert len(data["shap_values"]) > 0

    def test_predict_shap_entry_has_correct_keys(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        entry = data["shap_values"][0]
        assert "feature" in entry
        assert "shap_val" in entry
        assert "direction" in entry

    def test_predict_fold_probabilities_present(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert isinstance(data["fold_probabilities"], list)
        assert len(data["fold_probabilities"]) == 5

    def test_predict_threshold_used_present(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert 0.1 <= data["threshold_used"] <= 0.9

    def test_predict_latency_ms_positive(self, client):
        assert client.post("/predict", json=SAMPLE_CUSTOMER).json()["latency_ms"] > 0

    def test_predict_invalid_gender_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "gender": "Unknown"}
        assert client.post("/predict", json=bad).status_code == 422

    def test_predict_invalid_contract_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "Contract": "Weekly"}
        assert client.post("/predict", json=bad).status_code == 422

    def test_predict_negative_tenure_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "tenure": -5}
        assert client.post("/predict", json=bad).status_code == 422


# ── /whatif ──────────────────────────────────────────────────────

class TestWhatIf:
    def test_whatif_returns_200(self, client):
        payload = {"base": SAMPLE_CUSTOMER, "overrides": {"Contract": "Two year"}}
        assert client.post("/whatif", json=payload).status_code == 200

    def test_whatif_contract_upgrade_lowers_risk(self, client):
        payload = {"base": SAMPLE_CUSTOMER, "overrides": {"Contract": "Two year"}}
        data = client.post("/whatif", json=payload).json()
        assert data["modified_probability"] < data["original_probability"]

    def test_whatif_tiers_are_valid(self, client):
        payload = {"base": SAMPLE_CUSTOMER, "overrides": {"Contract": "Two year"}}
        data = client.post("/whatif", json=payload).json()
        assert data["original_risk_tier"] in {"High", "Medium", "Low"}
        assert data["modified_risk_tier"] in {"High", "Medium", "Low"}

    def test_whatif_overrides_in_response(self, client):
        payload = {"base": SAMPLE_CUSTOMER, "overrides": {"Contract": "Two year"}}
        data = client.post("/whatif", json=payload).json()
        assert "overrides" in data
        assert data["overrides"]["Contract"] == "Two year"


# ── /batch ───────────────────────────────────────────────────────

class TestBatch:
    def test_batch_single_customer(self, client):
        assert client.post("/batch", json={"customers": [SAMPLE_CUSTOMER]}).status_code == 200

    def test_batch_multiple_customers(self, client):
        data = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * 5}).json()
        assert data["summary"]["total"] == 5

    def test_batch_results_count_matches(self, client):
        n = 10
        data = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * n}).json()
        assert len(data["results"]) == n

    def test_batch_summary_fields_present(self, client):
        data = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER]}).json()
        for field in ["total", "high_risk", "medium_risk", "low_risk", "avg_churn_probability"]:
            assert field in data["summary"], f"Missing summary field: {field}"

    def test_batch_empty_returns_400(self, client):
        assert client.post("/batch", json={"customers": []}).status_code == 400

    def test_batch_over_limit_returns_400(self, client):
        assert client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * 501}).status_code == 400


# ── /dashboard ───────────────────────────────────────────────────

class TestDashboard:
    def test_dashboard_returns_200(self, client):
        assert client.get("/dashboard").status_code == 200

    def test_dashboard_model_metrics_present(self, client):
        data = client.get("/dashboard").json()
        assert "model_metrics" in data
        assert "roc_auc" in data["model_metrics"]

    def test_dashboard_confusion_matrix_present(self, client):
        data = client.get("/dashboard").json()
        cm = data.get("confusion_matrix", {})
        for k in ("tp", "fp", "fn", "tn"):
            assert k in cm, f"Missing confusion_matrix key: {k}"

    def test_dashboard_feature_importance_list(self, client):
        data = client.get("/dashboard").json()
        fi = data["feature_importance"]
        assert isinstance(fi, list) and len(fi) > 0
        assert "feature" in fi[0] and "importance" in fi[0]

    def test_dashboard_risk_distribution_sums(self, client):
        rd = client.get("/dashboard").json()["risk_distribution"]
        assert rd["high"] + rd["medium"] + rd["low"] == rd["total"]

    def test_dashboard_fold_metrics_count(self, client):
        folds = client.get("/dashboard").json()["model_health"]["fold_metrics"]
        assert len(folds) == 5
