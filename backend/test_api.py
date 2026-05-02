"""
tests/test_api.py
=================
Pytest test suite for ChurnGuard API.

Run with:
    pytest tests/ -v

Requires the backend to be importable (run from `backend/` directory).
Uses FastAPI's TestClient — no live server needed.
"""

import json
import pytest
from fastapi.testclient import TestClient

# ── sample payload ──────────────────────────────────────────────────────────
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
    """Create a TestClient with the FastAPI app."""
    from main import app
    with TestClient(app) as c:
        yield c


# ── /health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_contains_models_loaded(self, client):
        data = client.get("/health").json()
        assert "models_loaded" in data
        assert data["models_loaded"] == 5

    def test_health_contains_oof_auc(self, client):
        data = client.get("/health").json()
        assert "oof_auc" in data
        assert 0.7 < data["oof_auc"] < 1.0


# ── /sample ──────────────────────────────────────────────────────────────────

class TestSample:
    def test_sample_returns_200(self, client):
        res = client.get("/sample")
        assert res.status_code == 200

    def test_sample_has_required_fields(self, client):
        data = client.get("/sample").json()
        required = ["tenure", "MonthlyCharges", "Contract", "InternetService"]
        for field in required:
            assert field in data, f"Missing field: {field}"


# ── /predict ─────────────────────────────────────────────────────────────────

class TestPredict:
    def test_predict_returns_200(self, client):
        res = client.post("/predict", json=SAMPLE_CUSTOMER)
        assert res.status_code == 200, res.text

    def test_predict_probability_in_range(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        prob = data["churn_probability"]
        assert 0.0 <= prob <= 1.0

    def test_predict_risk_tier_valid(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert data["risk_tier"] in {"High", "Medium", "Low"}

    def test_predict_churn_prediction_is_bool(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert isinstance(data["churn_prediction"], bool)

    def test_predict_shap_features_present(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert isinstance(data["shap_top_features"], list)
        assert len(data["shap_top_features"]) > 0

    def test_predict_latency_ms_positive(self, client):
        data = client.post("/predict", json=SAMPLE_CUSTOMER).json()
        assert data["latency_ms"] > 0

    def test_predict_invalid_gender_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "gender": "Unknown"}
        res = client.post("/predict", json=bad)
        assert res.status_code == 422

    def test_predict_invalid_contract_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "Contract": "Weekly"}
        res = client.post("/predict", json=bad)
        assert res.status_code == 422

    def test_predict_negative_tenure_returns_422(self, client):
        bad = {**SAMPLE_CUSTOMER, "tenure": -5}
        res = client.post("/predict", json=bad)
        assert res.status_code == 422


# ── /whatif ──────────────────────────────────────────────────────────────────

class TestWhatIf:
    def test_whatif_returns_200(self, client):
        res = client.post(
            "/whatif",
            json=SAMPLE_CUSTOMER,
            params={"Contract": "Two year"},
        )
        assert res.status_code == 200, res.text

    def test_whatif_probabilities_differ(self, client):
        data = client.post(
            "/whatif",
            json=SAMPLE_CUSTOMER,
            params={"Contract": "Two year"},
        ).json()
        # Upgrading contract should lower probability for a high-risk customer
        assert data["original_probability"] != data["modified_probability"]

    def test_whatif_contract_upgrade_lowers_risk(self, client):
        data = client.post(
            "/whatif",
            json=SAMPLE_CUSTOMER,
            params={"Contract": "Two year"},
        ).json()
        assert data["modified_probability"] < data["original_probability"]

    def test_whatif_overrides_in_response(self, client):
        data = client.post(
            "/whatif",
            json=SAMPLE_CUSTOMER,
            params={"Contract": "Two year"},
        ).json()
        assert "overrides" in data

    def test_whatif_tiers_are_valid(self, client):
        data = client.post(
            "/whatif",
            json=SAMPLE_CUSTOMER,
            params={"Contract": "Two year"},
        ).json()
        assert data["original_risk_tier"] in {"High", "Medium", "Low"}
        assert data["modified_risk_tier"] in {"High", "Medium", "Low"}


# ── /batch ───────────────────────────────────────────────────────────────────

class TestBatch:
    def test_batch_single_customer(self, client):
        res = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER]})
        assert res.status_code == 200, res.text

    def test_batch_multiple_customers(self, client):
        res = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * 5})
        data = res.json()
        assert data["summary"]["total"] == 5

    def test_batch_results_count_matches(self, client):
        n = 10
        res = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * n})
        data = res.json()
        assert len(data["results"]) == n

    def test_batch_summary_fields_present(self, client):
        data = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER]}).json()
        for field in ["total", "high_risk", "medium_risk", "low_risk", "avg_churn_probability"]:
            assert field in data["summary"], f"Missing summary field: {field}"

    def test_batch_empty_returns_400(self, client):
        res = client.post("/batch", json={"customers": []})
        assert res.status_code == 400

    def test_batch_over_limit_returns_400(self, client):
        res = client.post("/batch", json={"customers": [SAMPLE_CUSTOMER] * 501})
        assert res.status_code == 400


# ── /dashboard ───────────────────────────────────────────────────────────────

class TestDashboard:
    def test_dashboard_returns_200(self, client):
        res = client.get("/dashboard")
        assert res.status_code == 200

    def test_dashboard_model_metrics_present(self, client):
        data = client.get("/dashboard").json()
        assert "model_metrics" in data
        assert "roc_auc" in data["model_metrics"]

    def test_dashboard_feature_importance_list(self, client):
        data = client.get("/dashboard").json()
        fi = data["feature_importance"]
        assert isinstance(fi, list)
        assert len(fi) > 0
        assert "feature" in fi[0]
        assert "importance" in fi[0]

    def test_dashboard_risk_distribution_sums(self, client):
        data = client.get("/dashboard").json()
        rd = data["risk_distribution"]
        assert rd["high"] + rd["medium"] + rd["low"] == 1000  # sim population

    def test_dashboard_fold_metrics_count(self, client):
        data = client.get("/dashboard").json()
        folds = data["model_health"]["fold_metrics"]
        assert len(folds) == 5
