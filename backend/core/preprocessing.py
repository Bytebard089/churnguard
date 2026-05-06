"""
churnguard/backend/core/preprocessing.py

This is a direct translation of your Colab notebook into production code.
Every function here mirrors the notebook exactly — same column names,
same feature engineering, same get_dummies logic.
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR   = Path(__file__).resolve().parent.parent / "models"
METADATA_PATH = MODELS_DIR / "metadata.json"
COLUMNS_PATH  = MODELS_DIR / "feature_columns.json"

# ── Load artifacts once ───────────────────────────────────────────────────────
_metadata        = None
_feature_columns = None

def get_metadata() -> dict:
    global _metadata
    if _metadata is None:
        if not METADATA_PATH.exists():
            raise FileNotFoundError(
                f"[ChurnGuard] Missing: {METADATA_PATH}\n"
                "  → Run notebooks/save_model.py in Colab first."
            )
        _metadata = json.loads(METADATA_PATH.read_text())
    return _metadata

def get_feature_columns() -> list[str]:
    global _feature_columns
    if _feature_columns is None:
        if not COLUMNS_PATH.exists():
            raise FileNotFoundError(
                f"[ChurnGuard] Missing: {COLUMNS_PATH}\n"
                "  → Run notebooks/save_model.py in Colab first."
            )
        _feature_columns = json.loads(COLUMNS_PATH.read_text())
    return _feature_columns


# ── Step 1: Basic preprocessing (from your preprocess() function) ─────────────

def basic_preprocess(df: pd.DataFrame) -> pd.DataFrame:
    """
    Mirrors your notebook's preprocess() function exactly.
    - SeniorCitizen: 0/1 → 'No'/'Yes'  (needed for get_dummies to work right)
    - TotalCharges:  coerce to numeric, fill NaN with MonthlyCharges
    """
    df = df.copy()

    # SeniorCitizen comes in as int (0/1) from the API — convert to string
    # so it gets dummies the same way as training data
    if df['SeniorCitizen'].dtype != object:
        df['SeniorCitizen'] = df['SeniorCitizen'].map({0: 'No', 1: 'Yes'})

    # TotalCharges: some rows have spaces → coerce to NaN → fill with MonthlyCharges
    df['TotalCharges'] = pd.to_numeric(df['TotalCharges'], errors='coerce')
    df['TotalCharges'] = df['TotalCharges'].fillna(df['MonthlyCharges'])

    return df


# ── Step 2: Feature engineering (from your engineer() function) ───────────────

SERVICES = [
    'OnlineSecurity', 'OnlineBackup', 'DeviceProtection',
    'TechSupport', 'StreamingTV', 'StreamingMovies'
]

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Mirrors your notebook's engineer() function exactly.
    Creates all 14 engineered features in the same order.
    """
    df = df.copy()

    # Normalize "No internet service" → "No" for service columns
    for s in SERVICES:
        if s in df.columns:
            df[s] = df[s].replace('No internet service', 'No')

    # ── Count-based features ──────────────────────────────────────────────────
    df['service_count'] = (df[SERVICES] == 'Yes').sum(axis=1)
    df['autopay']       = df['PaymentMethod'].str.contains('automatic', case=False, na=False).astype('int8')
    df['tenure_group']  = (df['tenure'] // 12).astype('int8')

    # ── Contract risk score (0=safe, 2=risky) ────────────────────────────────
    df['contract_risk'] = df['Contract'].map({
        'Month-to-month': 2,
        'One year':       1,
        'Two year':       0
    })

    # ── Interaction features ──────────────────────────────────────────────────
    df['charge_contract_risk'] = df['MonthlyCharges'] * df['contract_risk']
    df['tenure_contract_risk'] = df['tenure']         * df['contract_risk']

    # ── Charge-derived features ───────────────────────────────────────────────
    df['AvgMonthlyCharges'] = df['TotalCharges'] / (df['tenure'] + 1)
    df['ChargeRatio']       = df['TotalCharges'] / (df['MonthlyCharges'] + 1)
    df['ChargePerService']  = df['MonthlyCharges'] / (df['service_count'] + 1)
    df['ExpectedTotal']     = df['MonthlyCharges'] * df['tenure']
    df['ChargeDiff']        = df['TotalCharges'] - df['ExpectedTotal']

    # ── Binary risk flags ─────────────────────────────────────────────────────
    df['high_risk'] = (
        (df['Contract']        == 'Month-to-month') &
        (df['InternetService'] == 'Fiber optic')    &
        (df['PaperlessBilling']== 'Yes')
    ).astype('int8')

    df['risk_flag'] = (
        (df['Contract']      == 'Month-to-month') &
        (df['PaymentMethod'] == 'Electronic check')
    ).astype('int8')

    df['fiber_no_sec'] = (
        (df['InternetService'] == 'Fiber optic') &
        (df['OnlineSecurity']  == 'No')
    ).astype('int8')

    df['new_mtm'] = (
        (df['tenure']   <= 6) &
        (df['Contract'] == 'Month-to-month')
    ).astype('int8')

    df['mtm_high_charge'] = (
        (df['Contract']        == 'Month-to-month') &
        (df['MonthlyCharges']  >  70)
    ).astype('int8')

    # ── Composite risk score ──────────────────────────────────────────────────
    df['risk_score'] = (
        df['risk_flag']   +
        df['high_risk']   +
        df['fiber_no_sec']+
        df['new_mtm']     +
        df['autopay'].map({0: 1, 1: 0})
    )

    return df


# ── Step 3: One-hot encode + column alignment ─────────────────────────────────

def encode_and_align(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply pd.get_dummies() then align columns to match training data exactly.

    Key insight: the API receives ONE row at a time, so some dummy columns
    (e.g. Contract_Two year) may be missing after get_dummies if the input
    doesn't have that value. reindex() fills them with 0 — exactly what
    the model expects.
    """
    df = pd.get_dummies(df)

    # Align to training columns (add missing cols as 0, drop any extras)
    feature_columns = get_feature_columns()
    df = df.reindex(columns=feature_columns, fill_value=0)

    return df


# ── Full pipeline ─────────────────────────────────────────────────────────────

def preprocess(raw_input: dict | list[dict]) -> np.ndarray:
    """
    End-to-end preprocessing:
      raw API input dict
        → basic_preprocess()
        → engineer_features()
        → encode_and_align()
        → numpy array ready for model.predict_proba()

    Args:
        raw_input: single customer dict OR list of dicts

    Returns:
        numpy array of shape (n_rows, n_features)
    """
    if isinstance(raw_input, dict):
        raw_input = [raw_input]

    df = pd.DataFrame(raw_input)
    df = basic_preprocess(df)
    df = engineer_features(df)
    df = encode_and_align(df)

    return df.values.astype(np.float32)


# ── Input validation ──────────────────────────────────────────────────────────

# These are the raw columns the API expects (before any feature engineering)
REQUIRED_NUMERIC = ["tenure", "MonthlyCharges", "TotalCharges"]

REQUIRED_CATEGORICAL = [
    "gender", "SeniorCitizen", "Partner", "Dependents",
    "PhoneService", "MultipleLines", "InternetService",
    "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies",
    "Contract", "PaperlessBilling", "PaymentMethod"
]

# Valid values for categorical columns (for API validation)
VALID_VALUES = {
    "gender":           ["Male", "Female"],
    "SeniorCitizen":    [0, 1, "Yes", "No"],
    "Partner":          ["Yes", "No"],
    "Dependents":       ["Yes", "No"],
    "PhoneService":     ["Yes", "No"],
    "MultipleLines":    ["Yes", "No", "No phone service"],
    "InternetService":  ["DSL", "Fiber optic", "No"],
    "OnlineSecurity":   ["Yes", "No", "No internet service"],
    "OnlineBackup":     ["Yes", "No", "No internet service"],
    "DeviceProtection": ["Yes", "No", "No internet service"],
    "TechSupport":      ["Yes", "No", "No internet service"],
    "StreamingTV":      ["Yes", "No", "No internet service"],
    "StreamingMovies":  ["Yes", "No", "No internet service"],
    "Contract":         ["Month-to-month", "One year", "Two year"],
    "PaperlessBilling": ["Yes", "No"],
    "PaymentMethod":    [
        "Electronic check", "Mailed check",
        "Bank transfer (automatic)", "Credit card (automatic)"
    ],
}

def validate_input(data: dict) -> list[str]:
    """
    Returns list of error strings. Empty = valid.
    Called by the API before running any preprocessing.
    """
    errors = []
    all_required = REQUIRED_NUMERIC + REQUIRED_CATEGORICAL

    for field in all_required:
        if field not in data:
            errors.append(f"Missing required field: '{field}'")
            continue
        if data[field] is None:
            errors.append(f"Field '{field}' cannot be null")
            continue

    # Numeric range checks
    if "tenure" in data and data["tenure"] is not None:
        if not (0 <= float(data["tenure"]) <= 120):
            errors.append("'tenure' must be between 0 and 120 months")

    if "MonthlyCharges" in data and data["MonthlyCharges"] is not None:
        if not (0 < float(data["MonthlyCharges"]) <= 500):
            errors.append("'MonthlyCharges' must be between 0 and 500")

    # Categorical value checks
    for field, valid in VALID_VALUES.items():
        if field in data and data[field] is not None:
            if data[field] not in valid:
                errors.append(
                    f"'{field}' has invalid value '{data[field]}'. "
                    f"Allowed: {valid}"
                )

    return errors


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    print("Testing preprocessing pipeline...\n")

    sample_path = MODELS_DIR / "sample_input.json"
    if not sample_path.exists():
        print("[!] No sample_input.json found.")
        print("    Run notebooks/save_model.py in your Colab notebook first.")
        sys.exit(1)

    sample = json.loads(sample_path.read_text())
    print(f"  Raw input fields : {list(sample.keys())}")
    print(f"  SeniorCitizen    : {sample.get('SeniorCitizen')} (type: {type(sample.get('SeniorCitizen')).__name__})")

    errors = validate_input(sample)
    if errors:
        print("\n  [!] Validation errors:\n    " + "\n    ".join(errors))
        sys.exit(1)
    print("  [✓] Validation passed")

    result = preprocess(sample)
    expected_cols = len(get_feature_columns())
    print(f"  [✓] Preprocessed shape: {result.shape}  (expected n_cols={expected_cols})")

    if result.shape[1] != expected_cols:
        print(f"  [!] Column mismatch! Got {result.shape[1]}, expected {expected_cols}")
        print("      Make sure feature_columns.json matches the model's training columns.")
        sys.exit(1)

    print("\n  [✓] Preprocessing pipeline working correctly")
