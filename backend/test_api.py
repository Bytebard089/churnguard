"""
churnguard/backend/test_api.py

Run this to verify every API endpoint works before moving to the frontend.

Usage:
  # In one terminal — start the server:
  python main.py

  # In another terminal — run tests:
  python test_api.py
"""

import json
import sys
import time
import requests

BASE = "http://localhost:8000"

PASS = "  ✓"
FAIL = "  ✗"

# ── Sample customer — typical high-risk profile ───────────────────────────────
SAMPLE = {
    "gender": "Female",
    "SeniorCitizen": 0,
    "Partner": "Yes",
    "Dependents": "No",
    "tenure": 8,
    "PhoneService": "Yes",
    "MultipleLines": "No",
    "InternetService": "Fiber optic",
    "OnlineSecurity": "No",
    "OnlineBackup": "No",
    "DeviceProtection": "No",
    "TechSupport": "No",
    "StreamingTV": "Yes",
    "StreamingMovies": "Yes",
    "Contract": "Month-to-month",
    "PaperlessBilling": "Yes",
    "PaymentMethod": "Electronic check",
    "MonthlyCharges": 84.45,
    "TotalCharges": 673.45,
}

LOW_RISK = {
    **SAMPLE,
    "tenure": 60,
    "Contract": "Two year",
    "PaymentMethod": "Bank transfer (automatic)",
    "PaperlessBilling": "No",
    "MonthlyCharges": 45.0,
    "TotalCharges": 2700.0,
}

errors = []

def check(label, condition, detail=""):
    if condition:
        print(f"{PASS}  {label}")
    else:
        print(f"{FAIL}  {label}  ← {detail}")
        errors.append(label)


# ── Test 1: Health ────────────────────────────────────────────────────────────
print("\n── GET /health ──────────────────────────────────────────────────")
r = requests.get(f"{BASE}/health")
check("Status 200",          r.status_code == 200)
data = r.json()
check("Has 'status' key",    "status" in data)
check("Models loaded > 0",   data.get("models_loaded", 0) > 0,
      "Are model files in backend/models/?")
print(f"     models={data.get('models_loaded')}  features={data.get('n_features')}  oof_auc={data.get('oof_auc')}")


# ── Test 2: Sample endpoint ───────────────────────────────────────────────────
print("\n── GET /sample ──────────────────────────────────────────────────")
r = requests.get(f"{BASE}/sample")
check("Status 200",          r.status_code == 200)
sample = r.json()
check("Has 'tenure' key",    "tenure" in sample)
check("Has 'Contract' key",  "Contract" in sample)


# ── Test 3: Features endpoint ─────────────────────────────────────────────────
print("\n── GET /features ────────────────────────────────────────────────")
r = requests.get(f"{BASE}/features")
check("Status 200",          r.status_code == 200)
features = r.json()
check("Returns list",        isinstance(features, list))
check("Has ≥ 10 fields",     len(features) >= 10, f"got {len(features)}")


# ── Test 4: Predict — high-risk customer ──────────────────────────────────────
print("\n── POST /predict (high-risk customer) ───────────────────────────")
r = requests.post(f"{BASE}/predict", json=SAMPLE)
check("Status 200",                    r.status_code == 200, r.text[:200])
pred = r.json()
check("Has churn_probability",         "churn_probability" in pred)
check("Probability in [0,1]",          0 <= pred.get("churn_probability", -1) <= 1)
check("Has risk_tier",                 pred.get("risk_tier") in ["High", "Medium", "Low"])
check("Has shap_values (list)",        isinstance(pred.get("shap_values"), list))
check("SHAP has ≥ 5 entries",          len(pred.get("shap_values", [])) >= 5)
check("SHAP entry has 'feature' key",  "feature" in pred["shap_values"][0])
check("SHAP entry has 'impact' key",   "impact"  in pred["shap_values"][0])
check("Has fold_probabilities",        len(pred.get("fold_probabilities", [])) == 5,
      f"got {len(pred.get('fold_probabilities', []))}")
check("Has latency_ms",                "latency_ms" in pred)
print(f"     prob={pred.get('churn_probability')}  tier={pred.get('risk_tier')}  conf={pred.get('confidence')}  {pred.get('latency_ms')}ms")
print(f"     Top SHAP driver: {pred['shap_values'][0].get('feature')}  impact={pred['shap_values'][0].get('impact')}")


# ── Test 5: Predict — low-risk customer ───────────────────────────────────────
print("\n── POST /predict (low-risk customer) ────────────────────────────")
r = requests.post(f"{BASE}/predict", json=LOW_RISK)
check("Status 200",         r.status_code == 200)
pred_low = r.json()
check("Probability < high-risk",
      pred_low.get("churn_probability", 1) < pred.get("churn_probability", 0),
      f"low={pred_low.get('churn_probability')} vs high={pred.get('churn_probability')}")
print(f"     prob={pred_low.get('churn_probability')}  tier={pred_low.get('risk_tier')}")


# ── Test 6: Validation error ──────────────────────────────────────────────────
print("\n── POST /predict (bad input — should return 422) ────────────────")
bad = {**SAMPLE, "Contract": "INVALID_CONTRACT"}
r = requests.post(f"{BASE}/predict", json=bad)
check("Returns 422",  r.status_code == 422, f"got {r.status_code}")

print("\n── POST /predict (missing field — should return 422) ────────────")
incomplete = {k: v for k, v in SAMPLE.items() if k != "MonthlyCharges"}
r = requests.post(f"{BASE}/predict", json=incomplete)
check("Returns 422",  r.status_code == 422, f"got {r.status_code}")


# ── Test 7: What-if ────────────────────────────────────────────────────────────
print("\n── POST /whatif ─────────────────────────────────────────────────")
whatif_body = {
    "customer":  SAMPLE,
    "overrides": {"Contract": "Two year", "PaymentMethod": "Bank transfer (automatic)"}
}
r = requests.post(f"{BASE}/whatif", json=whatif_body)
check("Status 200",                     r.status_code == 200, r.text[:200])
wi = r.json()
check("Has 'original' key",             "original"  in wi)
check("Has 'modified' key",             "modified"  in wi)
check("Has 'probability_delta'",        "probability_delta" in wi)
check("Delta is negative (risk went down)",
      wi.get("probability_delta", 1) < 0,
      f"delta={wi.get('probability_delta')} — switching to 2yr contract should reduce churn prob")
print(f"     original={wi['original']['churn_probability']}  →  modified={wi['modified']['churn_probability']}  delta={wi['probability_delta']}")


# ── Test 8: Batch CSV upload ───────────────────────────────────────────────────
print("\n── POST /batch (2-row CSV) ───────────────────────────────────────")
import io
import csv

rows = [SAMPLE, LOW_RISK]
buf = io.StringIO()
writer = csv.DictWriter(buf, fieldnames=list(SAMPLE.keys()))
writer.writeheader()
writer.writerows(rows)
csv_bytes = buf.getvalue().encode()

r = requests.post(
    f"{BASE}/batch",
    files={"file": ("test_customers.csv", io.BytesIO(csv_bytes), "text/csv")}
)
check("Status 200",             r.status_code == 200, r.text[:300])
check("Returns CSV content",    "text/csv" in r.headers.get("content-type", ""))

import pandas as pd
result_df = pd.read_csv(io.StringIO(r.content.decode()))
check("Result has 2 rows",              len(result_df) == 2, f"got {len(result_df)}")
check("Has churn_probability column",   "churn_probability" in result_df.columns)
check("Has risk_tier column",           "risk_tier"         in result_df.columns)
print(f"     Row 0: prob={result_df['churn_probability'].iloc[0]}  tier={result_df['risk_tier'].iloc[0]}")
print(f"     Row 1: prob={result_df['churn_probability'].iloc[1]}  tier={result_df['risk_tier'].iloc[1]}")


# ── Summary ────────────────────────────────────────────────────────────────────
print("\n" + "="*55)
if not errors:
    print(f"  ALL TESTS PASSED ✓ — backend is ready for Step 3 (frontend)")
else:
    print(f"  {len(errors)} test(s) FAILED:")
    for e in errors:
        print(f"    - {e}")
    print("\n  Fix these before moving to the frontend.")
print("="*55 + "\n")
