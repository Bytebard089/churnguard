"""
backend/core/features.py
========================
Single source of truth for all feature engineering.

This file is imported by BOTH:
  - notebooks/save_model.py   (training)
  - backend/main.py           (serving)

Any change here automatically applies to both.
Never define engineer_features() in any other file.

Key variables from your Colab notebook:
  CSV         : train.csv / test.csv
  Models list : fold_models   (added by updated save_model.py)
  OOF preds   : oof_preds
"""

from __future__ import annotations

import pandas as pd


# ── Column groups ─────────────────────────────────────────────────────────────

NUMERIC_COLS = ["tenure", "MonthlyCharges", "TotalCharges"]

CATEGORICAL_COLS = [
    "gender", "SeniorCitizen", "Partner", "Dependents",
    "PhoneService", "MultipleLines", "InternetService",
    "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies",
    "Contract", "PaperlessBilling", "PaymentMethod",
]

SERVICE_COLS = [
    "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies",
]

# ── Preprocessing (run before engineer) ──────────────────────────────────────

def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean raw Telco data.
    Mirrors the preprocess() function in your Colab notebook exactly.
    """
    df = df.copy()
    # SeniorCitizen: 0/1 int → 'No'/'Yes' string
    df["SeniorCitizen"] = df["SeniorCitizen"].map(
        {0: "No", 1: "Yes", "0": "No", "1": "Yes", "No": "No", "Yes": "Yes"}
    ).fillna(df["SeniorCitizen"])
    # TotalCharges: coerce non-numeric, fill NaN with MonthlyCharges
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df["TotalCharges"] = df["TotalCharges"].fillna(df["MonthlyCharges"])
    return df


# ── Feature engineering ───────────────────────────────────────────────────────

def engineer(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build derived features.

    This is the EXACT engineer() function from your Colab notebook —
    not a reimplementation. The definition lives here and is imported
    everywhere so training and serving always use identical logic.

    Parameters
    ----------
    df : pd.DataFrame
        Preprocessed customer data (after preprocess() has been called).

    Returns
    -------
    pd.DataFrame
        DataFrame with all derived columns added (raw categoricals still present).
    """
    df = df.copy()

    # ── normalise 'No internet service' → 'No' for service cols ──
    for s in SERVICE_COLS:
        if s in df.columns:
            df[s] = df[s].replace("No internet service", "No")

    # ── service count ──
    present_services = [s for s in SERVICE_COLS if s in df.columns]
    df["service_count"] = (df[present_services] == "Yes").sum(axis=1)

    # ── autopay flag ──
    df["autopay"] = df["PaymentMethod"].str.contains("automatic", na=False).astype("int8")

    # ── tenure group ──
    df["tenure_group"] = (df["tenure"] // 12).astype("int8")

    # ── contract risk ──
    df["contract_risk"] = df["Contract"].map(
        {"Month-to-month": 2, "One year": 1, "Two year": 0}
    ).fillna(2).astype(int)

    # ── interaction terms ──
    df["charge_contract_risk"] = df["MonthlyCharges"] * df["contract_risk"]
    df["tenure_contract_risk"] = df["tenure"]         * df["contract_risk"]

    # ── charge analytics ──
    df["AvgMonthlyCharges"] = df["TotalCharges"] / (df["tenure"] + 1)
    df["ChargeRatio"]       = df["TotalCharges"] / (df["MonthlyCharges"] + 1)
    df["ChargePerService"]  = df["MonthlyCharges"] / (df["service_count"] + 1)
    df["ExpectedTotal"]     = df["MonthlyCharges"] * df["tenure"]
    df["ChargeDiff"]        = df["TotalCharges"] - df["ExpectedTotal"]

    # ── risk flags (EXACT logic from your Colab) ──
    df["high_risk"] = (
        (df["Contract"] == "Month-to-month") &
        (df["InternetService"] == "Fiber optic") &
        (df["PaperlessBilling"] == "Yes")
    ).astype("int8")

    df["risk_flag"] = (
        (df["Contract"] == "Month-to-month") &
        (df["PaymentMethod"] == "Electronic check")
    ).astype("int8")

    df["fiber_no_sec"] = (
        (df["InternetService"] == "Fiber optic") &
        (df["OnlineSecurity"] == "No")
    ).astype("int8")

    df["new_mtm"] = (
        (df["tenure"] <= 6) &
        (df["Contract"] == "Month-to-month")
    ).astype("int8")

    df["mtm_high_charge"] = (
        (df["Contract"] == "Month-to-month") &
        (df["MonthlyCharges"] > 70)
    ).astype("int8")

    df["risk_score"] = (
        df["risk_flag"] +
        df["high_risk"] +
        df["fiber_no_sec"] +
        df["new_mtm"] +
        df["autopay"].map({0: 1, 1: 0})
    )

    return df


def align_columns(df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    """
    After get_dummies, ensure df has exactly feature_cols columns.
    Missing columns are added as 0; extra columns are dropped.
    """
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0
    return df[feature_cols].astype(float)


def engineer_for_serving(
    df: pd.DataFrame,
    feature_cols: list[str],
) -> pd.DataFrame:
    """
    Full pipeline for API serving:
      preprocess → engineer → get_dummies → align

    Parameters
    ----------
    df          : Raw customer record(s) as DataFrame
    feature_cols: The exact column list saved during training

    Returns
    -------
    pd.DataFrame ready to pass to model.predict_proba()
    """
    df = preprocess(df)
    df = engineer(df)
    df = pd.get_dummies(df, drop_first=True)
    df = align_columns(df, feature_cols)
    return df
