"""
================================================
  ChurnGuard — Save Model (Colab)
  Add this as the LAST CELL in your notebook.
  Run it, then download the churnguard_artifacts/ folder.
================================================
"""

import os, json, joblib
import numpy as np
import pandas as pd
from datetime import datetime

# ── 1. Output folder ─────────────────────────────────────────────────────────
SAVE_DIR = "churnguard_artifacts"
os.makedirs(SAVE_DIR, exist_ok=True)
print(f"Saving to ./{SAVE_DIR}/\n")

# ── 2. Save ALL 5 fold models ─────────────────────────────────────────────────
# Your notebook trains a new `model` variable each fold.
# We need to save each one. Replace the training loop with the one below,
# OR just collect the models into a list as shown.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  CHANGE YOUR TRAINING LOOP to this (only 3 lines added):               │
# └─────────────────────────────────────────────────────────────────────────┘
#
#   fold_models = []          # ← ADD THIS before the loop
#
#   for fold, (tr_idx, va_idx) in enumerate(kf.split(X, y), 1):
#       ...your existing code...
#       model.fit(...)        # same as before
#       fold_models.append(model)    # ← ADD THIS inside the loop, after fit
#       ...rest of your code...
#
# After making that change, the save below will work.

joblib.dump(fold_models, f"{SAVE_DIR}/fold_models.pkl")
print(f"[✓] Saved {len(fold_models)} fold models  → fold_models.pkl")

# ── 3. Save the column list (critical — needed to align test data) ────────────
# X.columns is the final feature list AFTER pd.get_dummies()
feature_columns = X.columns.tolist()
with open(f"{SAVE_DIR}/feature_columns.json", "w") as f:
    json.dump(feature_columns, f, indent=2)
print(f"[✓] Saved {len(feature_columns)} feature columns  → feature_columns.json")

# ── 4. Save metadata ──────────────────────────────────────────────────────────
metadata = {
    "n_folds":             len(fold_models),
    "n_features":          len(feature_columns),
    "feature_columns":     feature_columns,
    "scale_pos_weight":    float(pos_w),
    "oof_auc":             float(roc_auc_score(y, oof_preds)),
    "saved_at":            datetime.now().isoformat(),

    # Raw columns the model expects BEFORE get_dummies
    # (used for API input validation)
    "raw_numeric_cols": [
        "tenure", "MonthlyCharges", "TotalCharges"
    ],
    "raw_categorical_cols": [
        "gender", "SeniorCitizen", "Partner", "Dependents",
        "PhoneService", "MultipleLines", "InternetService",
        "OnlineSecurity", "OnlineBackup", "DeviceProtection",
        "TechSupport", "StreamingTV", "StreamingMovies",
        "Contract", "PaperlessBilling", "PaymentMethod"
    ],
}
with open(f"{SAVE_DIR}/metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)
print(f"[✓] Saved metadata  → metadata.json")
print(f"    OOF AUC: {metadata['oof_auc']:.5f}")

# ── 5. Save a sample input row (for API testing) ──────────────────────────────
# We save a RAW row (before engineer/dummies) — that's what the API will receive
# Re-read the original train.csv to get a clean raw row
raw_train = pd.read_csv("train.csv")
sample_raw = raw_train.drop(columns=["id", "Churn"]).iloc[0].to_dict()

# Convert numpy types to plain Python
def to_python(v):
    if isinstance(v, (np.integer,)):  return int(v)
    if isinstance(v, (np.floating,)): return float(v)
    return v

sample_raw = {k: to_python(v) for k, v in sample_raw.items()}
with open(f"{SAVE_DIR}/sample_input.json", "w") as f:
    json.dump(sample_raw, f, indent=2)
print(f"[✓] Saved sample input  → sample_input.json")

# ── 6. Sanity check ───────────────────────────────────────────────────────────
print("\n── Sanity check ──────────────────────────────────────")
loaded_models  = joblib.load(f"{SAVE_DIR}/fold_models.pkl")
loaded_columns = json.load(open(f"{SAVE_DIR}/feature_columns.json"))

# Run sample through the full pipeline
sample_df = pd.DataFrame([sample_raw])
sample_df['SeniorCitizen'] = sample_df['SeniorCitizen'].map({0: 'No', 1: 'Yes'})
sample_df['TotalCharges']  = pd.to_numeric(sample_df['TotalCharges'], errors='coerce')
sample_df['TotalCharges']  = sample_df['TotalCharges'].fillna(sample_df['MonthlyCharges'])

# (engineer features inline for the check)
services = ['OnlineSecurity','OnlineBackup','DeviceProtection',
            'TechSupport','StreamingTV','StreamingMovies']
for s in services:
    sample_df[s] = sample_df[s].replace('No internet service', 'No')
sample_df['service_count']  = (sample_df[services] == 'Yes').sum(axis=1)
sample_df['autopay']        = sample_df['PaymentMethod'].str.contains('automatic').astype('int8')
sample_df['tenure_group']   = (sample_df['tenure'] // 12).astype('int8')
sample_df['contract_risk']  = sample_df['Contract'].map({'Month-to-month':2,'One year':1,'Two year':0})
sample_df['charge_contract_risk'] = sample_df['MonthlyCharges'] * sample_df['contract_risk']
sample_df['tenure_contract_risk'] = sample_df['tenure']         * sample_df['contract_risk']
sample_df['AvgMonthlyCharges']    = sample_df['TotalCharges'] / (sample_df['tenure'] + 1)
sample_df['ChargeRatio']          = sample_df['TotalCharges'] / (sample_df['MonthlyCharges'] + 1)
sample_df['ChargePerService']     = sample_df['MonthlyCharges'] / (sample_df['service_count'] + 1)
sample_df['ExpectedTotal']        = sample_df['MonthlyCharges'] * sample_df['tenure']
sample_df['ChargeDiff']           = sample_df['TotalCharges']   - sample_df['ExpectedTotal']
sample_df['high_risk']    = ((sample_df['Contract']=='Month-to-month')&(sample_df['InternetService']=='Fiber optic')&(sample_df['PaperlessBilling']=='Yes')).astype('int8')
sample_df['risk_flag']    = ((sample_df['Contract']=='Month-to-month')&(sample_df['PaymentMethod']=='Electronic check')).astype('int8')
sample_df['fiber_no_sec'] = ((sample_df['InternetService']=='Fiber optic')&(sample_df['OnlineSecurity']=='No')).astype('int8')
sample_df['new_mtm']      = ((sample_df['tenure']<=6)&(sample_df['Contract']=='Month-to-month')).astype('int8')
sample_df['mtm_high_charge'] = ((sample_df['Contract']=='Month-to-month')&(sample_df['MonthlyCharges']>70)).astype('int8')
sample_df['risk_score']   = (sample_df['risk_flag']+sample_df['high_risk']+sample_df['fiber_no_sec']+sample_df['new_mtm']+sample_df['autopay'].map({0:1,1:0}))
sample_df = pd.get_dummies(sample_df)
sample_df = sample_df.reindex(columns=loaded_columns, fill_value=0)

preds = np.mean([m.predict_proba(sample_df)[:,1] for m in loaded_models], axis=0)
print(f"  Ensemble churn prob: {preds[0]:.4f}")
print(f"  Models loaded: {len(loaded_models)}")
print(f"  Feature columns: {len(loaded_columns)}")
print("──────────────────────────────────────────────────")
print("\n[✓] ALL GOOD — download the folder: churnguard_artifacts/")
print("    Place its contents inside:  churnguard/backend/models/")
