"""
churnguard/backend/core/predict.py

Ensemble inference: averages predictions across all 5 fold models,
then generates a SHAP explanation using the last fold's model
(standard practice — SHAP on ensemble mean is expensive).
"""

import json
import shap
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from dataclasses import dataclass, asdict

from .preprocessing import (
    preprocess, validate_input,
    get_feature_columns, get_metadata,
    basic_preprocess, engineer_features,
    REQUIRED_CATEGORICAL, REQUIRED_NUMERIC
)

# ── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR      = Path(__file__).resolve().parent.parent / "models"
FOLD_MODELS_PATH = MODELS_DIR / "fold_models.pkl"


# ── Load artifacts once (cached) ─────────────────────────────────────────────
_fold_models     = None
_shap_explainer  = None

def get_fold_models() -> list:
    global _fold_models
    if _fold_models is None:
        if not FOLD_MODELS_PATH.exists():
            raise FileNotFoundError(
                f"[ChurnGuard] Missing: {FOLD_MODELS_PATH}\n"
                "  → Run notebooks/save_model.py in Colab first."
            )
        _fold_models = joblib.load(FOLD_MODELS_PATH)
        print(f"[ChurnGuard] Loaded {len(_fold_models)} fold models.")
    return _fold_models

def get_explainer():
    """
    Use TreeExplainer on the last fold model.
    We use fold[-1] consistently so explanations are stable.
    """
    global _shap_explainer
    if _shap_explainer is None:
        models = get_fold_models()
        _shap_explainer = shap.TreeExplainer(models[-1])
    return _shap_explainer


# ── Result structure ──────────────────────────────────────────────────────────

@dataclass
class ChurnPrediction:
    churn_probability: float      # averaged across 5 folds, 0.0–1.0
    churn_predicted:   bool       # True = will churn
    risk_tier:         str        # "High" | "Medium" | "Low"
    confidence:        str        # "High" | "Medium" | "Low"
    shap_values:       list       # top features driving this prediction
    fold_probabilities: list      # per-fold probabilities (shows model agreement)
    model_version:     str

    def to_dict(self) -> dict:
        return asdict(self)


# ── Thresholds ────────────────────────────────────────────────────────────────
HIGH_THRESHOLD   = 0.65   # → "High risk" — priority outreach
MEDIUM_THRESHOLD = 0.35   # → "Medium risk" — automated campaign
TOP_N_SHAP       = 8      # top N features to return


# ── Main predict function ─────────────────────────────────────────────────────

def predict_churn(raw_input: dict) -> dict:
    """
    Full pipeline for one customer:
      validate → preprocess → ensemble predict → SHAP explain → return dict

    Args:
        raw_input: dict matching the Telco dataset columns
                   (same fields as sample_input.json)
    Returns:
        prediction dict, safe to JSON serialize
    """
    # 1. Validate
    errors = validate_input(raw_input)
    if errors:
        raise ValueError(f"Input validation failed: {errors}")

    # 2. Preprocess (matches notebook pipeline exactly)
    X = preprocess(raw_input)   # shape: (1, n_features)

    # 3. Ensemble prediction — average across all 5 fold models
    models = get_fold_models()
    fold_probs = [float(m.predict_proba(X)[0, 1]) for m in models]
    churn_prob = float(np.mean(fold_probs))

    # 4. Risk tier + confidence
    risk_tier  = _get_risk_tier(churn_prob)
    confidence = _get_confidence(churn_prob, fold_probs)

    # 5. SHAP explanation
    shap_top = _explain(X)

    # 6. Version from env or default
    import os
    model_version = os.environ.get("MODEL_VERSION", "v1.0-5fold")

    return ChurnPrediction(
        churn_probability  = round(churn_prob, 4),
        churn_predicted    = churn_prob >= 0.5,
        risk_tier          = risk_tier,
        confidence         = confidence,
        shap_values        = shap_top,
        fold_probabilities = [round(p, 4) for p in fold_probs],
        model_version      = model_version,
    ).to_dict()


def predict_batch(raw_inputs: list[dict]) -> list[dict]:
    """
    Run predictions for a list of customers.
    Used by POST /batch (CSV upload).
    Returns one result per row; errors are captured per-row.
    """
    results = []
    for i, row in enumerate(raw_inputs):
        try:
            result = predict_churn(row)
            result["row_index"] = i
            results.append(result)
        except Exception as e:
            results.append({
                "row_index": i,
                "error":     str(e),
                "churn_probability": None,
            })
    return results


# ── SHAP explanation ──────────────────────────────────────────────────────────

def _explain(X: np.ndarray) -> list[dict]:
    """
    Compute SHAP values using the last fold model.
    Maps back to human-readable feature names.
    Returns top N features sorted by |impact|.
    """
    try:
        explainer  = get_explainer()
        shap_vals  = explainer.shap_values(X)   # shape: (1, n_features)
        shap_row   = shap_vals[0]

        feature_columns = get_feature_columns()

        # Pair feature name, shap value, and raw feature value
        triples = list(zip(feature_columns, shap_row, X[0]))

        # Sort by absolute impact
        triples.sort(key=lambda x: abs(x[1]), reverse=True)
        top = triples[:TOP_N_SHAP]

        return [
            {
                "feature":   _clean_name(name),
                "raw_value": round(float(raw_val), 4),
                "impact":    round(float(shap_val), 4),
                "direction": "increases_churn" if shap_val > 0 else "decreases_churn",
                "abs_impact": round(abs(float(shap_val)), 4),
            }
            for name, shap_val, raw_val in top
        ]

    except Exception as e:
        return [{"error": f"SHAP unavailable: {e}"}]


def _clean_name(col: str) -> str:
    """
    pd.get_dummies produces names like 'Contract_Month-to-month'.
    Clean them up for display.
    Examples:
      'Contract_Month-to-month' → 'Contract: Month-to-month'
      'service_count'           → 'Service Count'
      'high_risk'               → 'High Risk'
    """
    if "_" in col:
        parts = col.split("_", 1)
        # If it looks like a dummies column (second part has capital or special char)
        if len(parts) == 2 and (parts[1][0].isupper() or "-" in parts[1]):
            return f"{parts[0].replace('_', ' ').title()}: {parts[1]}"
    return col.replace("_", " ").title()


# ── What-if prediction ────────────────────────────────────────────────────────

def predict_whatif(base_input: dict, overrides: dict) -> dict:
    """
    Run a 'what-if' simulation.
    Takes the base customer input, applies overrides, returns new prediction.

    Args:
        base_input: original raw customer dict
        overrides:  dict of fields to change, e.g. {"Contract": "Two year"}

    Returns:
        dict with "original" and "modified" predictions for comparison
    """
    modified = {**base_input, **overrides}

    original_result = predict_churn(base_input)
    modified_result = predict_churn(modified)

    delta = round(
        modified_result["churn_probability"] - original_result["churn_probability"],
        4
    )

    return {
        "original":          original_result,
        "modified":          modified_result,
        "probability_delta": delta,
        "direction":         "decreased" if delta < 0 else "increased",
        "applied_overrides": overrides,
    }


# ── Tier / confidence helpers ─────────────────────────────────────────────────

def _get_risk_tier(prob: float) -> str:
    if prob >= HIGH_THRESHOLD:
        return "High"
    elif prob >= MEDIUM_THRESHOLD:
        return "Medium"
    return "Low"

def _get_confidence(prob: float, fold_probs: list[float]) -> str:
    """
    Confidence is based on two signals:
    1. Distance from 0.5 (how decisive is the ensemble?)
    2. Std deviation across folds (how much do folds agree?)
    """
    distance = abs(prob - 0.5)
    std      = float(np.std(fold_probs))

    if distance >= 0.30 and std <= 0.05:
        return "High"
    elif distance >= 0.15 and std <= 0.10:
        return "Medium"
    return "Low"


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    print("Testing prediction pipeline...\n")

    sample_path = MODELS_DIR / "sample_input.json"
    if not sample_path.exists():
        print("[!] No sample_input.json found.")
        print("    Run notebooks/save_model.py in Colab first.")
        sys.exit(1)

    sample = json.loads(sample_path.read_text())
    result = predict_churn(sample)

    print(f"  Churn probability  : {result['churn_probability']}")
    print(f"  Risk tier          : {result['risk_tier']}")
    print(f"  Confidence         : {result['confidence']}")
    print(f"  Fold probs         : {result['fold_probabilities']}")
    print(f"\n  Top SHAP drivers:")
    for s in result["shap_values"][:5]:
        if "error" in s:
            print(f"    [!] {s['error']}")
            break
        arrow = "▲" if s["direction"] == "increases_churn" else "▼"
        print(f"    {arrow} {s['feature']:<35} impact={s['impact']:+.4f}")

    print("\n  Testing what-if...")
    whatif = predict_whatif(sample, {"Contract": "Two year"})
    delta  = whatif["probability_delta"]
    print(f"  Switching to 'Two year' contract → probability delta: {delta:+.4f}")

    print("\n  [✓] Prediction pipeline working correctly")
