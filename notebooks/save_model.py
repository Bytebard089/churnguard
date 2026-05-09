# ruff: noqa
"""
ChurnGuard — Complete Colab Training Script  (v3.0)
====================================================
Replaces your original single-cell notebook.

Changes vs original:
  + fold_models list (was missing — models weren't being saved per fold)
  + PR-AUC metric  (honest metric for imbalanced data)
  + Threshold analysis (F1 + F2-optimal, F2 used as default)
  + MLflow experiment tracking
  + Per-fold metrics saved to metadata.json
  + SHAP summary plot saved as PNG for README

HOW TO USE IN COLAB:
  1. Upload train.csv and test.csv
  2. Run Cell 1 (pip install)
  3. Run Cell 2 (this script)
  4. Download churnguard_artifacts/ folder
  5. Copy contents → backend/models/
"""

# ── CELL 1: Install (run once, then restart runtime) ──────────────────────────
# !pip install xgboost scikit-learn pandas numpy joblib shap mlflow -q

# ── CELL 2: Full pipeline ─────────────────────────────────────────────────────
import os, json, joblib
import numpy  as np
import pandas as pd
import shap, mlflow, mlflow.xgboost
from datetime import datetime
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (
    roc_auc_score, average_precision_score,
    precision_score, recall_score, f1_score,
    fbeta_score, accuracy_score, confusion_matrix,
)
from xgboost import XGBClassifier

SAVE_DIR = "churnguard_artifacts"
os.makedirs(SAVE_DIR, exist_ok=True)

# ── Load ──────────────────────────────────────────────────────────────────────
train_raw = pd.read_csv("train.csv")
test_raw  = pd.read_csv("test.csv")
print(f"Train: {train_raw.shape}  |  Test: {test_raw.shape}")

# ── Preprocess (exact copy of your preprocess()) ──────────────────────────────
def preprocess(df):
    df = df.copy()
    df['SeniorCitizen'] = df['SeniorCitizen'].map({0:'No', 1:'Yes'})
    df['TotalCharges']  = pd.to_numeric(df['TotalCharges'], errors='coerce')
    df['TotalCharges']  = df['TotalCharges'].fillna(df['MonthlyCharges'])
    return df

train = preprocess(train_raw)
test  = preprocess(test_raw)

# ── Engineer (exact copy of your engineer()) ──────────────────────────────────
def engineer(df):
    df = df.copy()
    services = ['OnlineSecurity','OnlineBackup','DeviceProtection',
                'TechSupport','StreamingTV','StreamingMovies']
    for s in services:
        df[s] = df[s].replace('No internet service','No')

    df['service_count']        = (df[services]=='Yes').sum(axis=1)
    df['autopay']              = df['PaymentMethod'].str.contains('automatic').astype('int8')
    df['tenure_group']         = (df['tenure']//12).astype('int8')
    df['contract_risk']        = df['Contract'].map({'Month-to-month':2,'One year':1,'Two year':0})
    df['charge_contract_risk'] = df['MonthlyCharges'] * df['contract_risk']
    df['tenure_contract_risk'] = df['tenure']         * df['contract_risk']
    df['AvgMonthlyCharges']    = df['TotalCharges'] / (df['tenure'] + 1)
    df['ChargeRatio']          = df['TotalCharges'] / (df['MonthlyCharges'] + 1)
    df['ChargePerService']     = df['MonthlyCharges'] / (df['service_count'] + 1)
    df['ExpectedTotal']        = df['MonthlyCharges'] * df['tenure']
    df['ChargeDiff']           = df['TotalCharges'] - df['ExpectedTotal']
    df['high_risk']    = ((df['Contract']=='Month-to-month')&(df['InternetService']=='Fiber optic')&(df['PaperlessBilling']=='Yes')).astype('int8')
    df['risk_flag']    = ((df['Contract']=='Month-to-month')&(df['PaymentMethod']=='Electronic check')).astype('int8')
    df['fiber_no_sec'] = ((df['InternetService']=='Fiber optic')&(df['OnlineSecurity']=='No')).astype('int8')
    df['new_mtm']      = ((df['tenure']<=6)&(df['Contract']=='Month-to-month')).astype('int8')
    df['mtm_high_charge'] = ((df['Contract']=='Month-to-month')&(df['MonthlyCharges']>70)).astype('int8')
    df['risk_score']   = (df['risk_flag']+df['high_risk']+df['fiber_no_sec']+df['new_mtm']+df['autopay'].map({0:1,1:0}))
    return df

train = engineer(train)
test  = engineer(test)

y = train['Churn'].map({'Yes':1,'No':0})
X      = train.drop(['id','Churn'], axis=1)
X_test = test.drop(['id'], axis=1)

full   = pd.concat([X, X_test], axis=0).reset_index(drop=True)
full   = pd.get_dummies(full, drop_first=True)
n_tr   = len(X)
X      = full.iloc[:n_tr].reset_index(drop=True)
X_test = full.iloc[n_tr:].reset_index(drop=True)
feature_columns = X.columns.tolist()
print(f"Features: {len(feature_columns)}")

# ── Training config ───────────────────────────────────────────────────────────
SEED, FOLDS = 42, 5
kf     = StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED)
pos_w  = float((y==0).sum()/(y==1).sum())
print(f"scale_pos_weight: {pos_w:.3f}")

MODEL_PARAMS = dict(
    tree_method='hist', n_estimators=10000, learning_rate=0.01,
    max_depth=4, min_child_weight=10, subsample=0.8,
    colsample_bytree=0.8, colsample_bynode=0.8, gamma=1,
    reg_alpha=0.1, reg_lambda=2.0, scale_pos_weight=pos_w,
    eval_metric='auc', early_stopping_rounds=300, random_state=SEED,
)

oof_preds     = np.zeros(len(X))
test_preds    = np.zeros(len(X_test))
fold_models   = []          # FIX: collect each fold model
fold_metrics_list = []
fold_val_cache = []

# ── Fix 5: MLflow tracking ────────────────────────────────────────────────────
mlflow.set_experiment("churnguard_xgboost")
print("="*60)

with mlflow.start_run(run_name=f"5fold_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    mlflow.log_params({**{k:v for k,v in MODEL_PARAMS.items()
                          if k not in ('eval_metric',)},
                       "n_folds":FOLDS,"n_features":len(feature_columns),
                       "scale_pos_weight":round(pos_w,4)})

    for fold,(tr_idx,va_idx) in enumerate(kf.split(X,y),1):
        X_tr,X_va = X.iloc[tr_idx], X.iloc[va_idx]
        y_tr,y_va = y.iloc[tr_idx], y.iloc[va_idx]
        model = XGBClassifier(**MODEL_PARAMS)
        model.fit(X_tr,y_tr,eval_set=[(X_va,y_va)],verbose=1000)
        val_pred          = model.predict_proba(X_va)[:,1]
        oof_preds[va_idx] = val_pred
        test_preds       += model.predict_proba(X_test)[:,1]/FOLDS
        fold_models.append(model)   # FIX: save fold model
        fauc = roc_auc_score(y_va, val_pred)
        fold_metrics_list.append({"fold":fold,"roc_auc":round(fauc,5),"best_iter":model.best_iteration})
        fold_val_cache.append((y_va.to_numpy(), val_pred))
        print(f"Fold {fold}  AUC={fauc:.5f}  best_iter={model.best_iteration}")

    # ── OOF metrics ──────────────────────────────────────────────────────
    oof_auc = roc_auc_score(y, oof_preds)
    pr_auc  = average_precision_score(y, oof_preds)   # Fix 4: PR-AUC
    print(f"\nOOF ROC-AUC : {oof_auc:.5f}")
    print(f"OOF PR-AUC  : {pr_auc:.5f}  ← more honest for imbalanced data")

    # ── Fix 4: Threshold analysis ─────────────────────────────────────────
    print("\n── Threshold Analysis ───────────────────────────────────")
    thresholds = np.arange(0.10, 0.90, 0.02)
    f1s = [f1_score(y,(oof_preds>=t).astype(int),zero_division=0) for t in thresholds]
    f2s = [fbeta_score(y,(oof_preds>=t).astype(int),beta=2,zero_division=0) for t in thresholds]

    best_f1_t = float(thresholds[np.argmax(f1s)])
    best_f2_t = float(thresholds[np.argmax(f2s)])
    optimal_threshold = best_f2_t  # Use F2: missing churner costs more than false alarm

    print(f"Best F1 threshold : {best_f1_t:.2f}  (F1={max(f1s):.4f})")
    print(f"Best F2 threshold : {best_f2_t:.2f}  (F2={max(f2s):.4f})  ← USING THIS")
    print(f"  F2 weights recall 2x — missing a churner costs more than a false alarm")

    fp_  = (oof_preds >= optimal_threshold).astype(int)
    prec = precision_score(y,fp_,zero_division=0)
    rec  = recall_score(y,fp_,zero_division=0)
    f1_v = f1_score(y,fp_,zero_division=0)
    f2_v = fbeta_score(y,fp_,beta=2,zero_division=0)
    acc  = accuracy_score(y,fp_)
    tn,fp_n,fn,tp = confusion_matrix(y,fp_).ravel()
    print(f"\nAt threshold {optimal_threshold:.2f}: P={prec:.4f} R={rec:.4f} F1={f1_v:.4f} F2={f2_v:.4f} Acc={acc:.4f}")
    print(f"  TP={tp}  FP={fp_n}  FN={fn}  TN={tn}")

    # ── Per-fold metrics at the chosen threshold ───────────────────────
    for i, (y_true, y_pred) in enumerate(fold_val_cache):
        fold_bin = (y_pred >= optimal_threshold).astype(int)
        fold_metrics_list[i].update({
            "precision": round(precision_score(y_true, fold_bin, zero_division=0), 5),
            "recall":    round(recall_score(y_true, fold_bin, zero_division=0), 5),
            "f1":        round(f1_score(y_true, fold_bin, zero_division=0), 5),
        })

    # ── Log to MLflow ─────────────────────────────────────────────────────
    mlflow.log_metrics({"oof_roc_auc":round(oof_auc,5),"oof_pr_auc":round(pr_auc,5),
        "optimal_threshold":optimal_threshold,"precision":round(prec,5),
        "recall":round(rec,5),"f1":round(f1_v,5),"f2":round(f2_v,5),
        "accuracy":round(acc,5),"TP":int(tp),"FP":int(fp_n),"FN":int(fn),"TN":int(tn)})
    mlflow.xgboost.log_model(fold_models[0],"xgboost_fold0")
    print("\n[✓] MLflow run logged")

print("="*60)

# ── Save artifacts ────────────────────────────────────────────────────────────
joblib.dump(fold_models, f"{SAVE_DIR}/fold_models.pkl")
print(f"[✓] {len(fold_models)} fold models → fold_models.pkl")

with open(f"{SAVE_DIR}/feature_columns.json","w") as f:
    json.dump(feature_columns, f, indent=2)
print(f"[✓] {len(feature_columns)} features → feature_columns.json")

metadata = {
    "n_folds":FOLDS,"n_features":len(feature_columns),
    "feature_columns":feature_columns,"scale_pos_weight":round(pos_w,6),
    "oof_auc":round(oof_auc,6),"pr_auc":round(pr_auc,6),
    "optimal_threshold":optimal_threshold,
    "precision":round(prec,6),"recall":round(rec,6),
    "f1":round(f1_v,6),"f2":round(f2_v,6),"accuracy":round(acc,6),
    "confusion_matrix":{"tp":int(tp),"fp":int(fp_n),"fn":int(fn),"tn":int(tn)},
    "fold_metrics":fold_metrics_list,"saved_at":datetime.now().isoformat(),
    "raw_numeric_cols":["tenure","MonthlyCharges","TotalCharges"],
    "raw_categorical_cols":["gender","SeniorCitizen","Partner","Dependents",
        "PhoneService","MultipleLines","InternetService","OnlineSecurity","OnlineBackup",
        "DeviceProtection","TechSupport","StreamingTV","StreamingMovies",
        "Contract","PaperlessBilling","PaymentMethod"],
}
with open(f"{SAVE_DIR}/metadata.json","w") as f:
    json.dump(metadata, f, indent=2)
print(f"[✓] metadata.json  (AUC={oof_auc:.5f}  PR-AUC={pr_auc:.5f}  threshold={optimal_threshold:.2f})")

# Sample input
raw_first = train_raw.drop(columns=["id","Churn"]).iloc[0].to_dict()
def to_py(v):
    if hasattr(v,'item'): return v.item()
    return v
raw_first = {k:to_py(v) for k,v in raw_first.items()}
if raw_first.get("SeniorCitizen") in (0,1,"0","1"):
    raw_first["SeniorCitizen"] = "Yes" if int(raw_first["SeniorCitizen"])==1 else "No"
with open(f"{SAVE_DIR}/sample_input.json","w") as f:
    json.dump(raw_first, f, indent=2)
print("[✓] sample_input.json")

# Submission
sub = pd.read_csv("sample_submission.csv")
sub["Churn"] = test_preds
sub.to_csv("submission.csv", index=False)
print(f"[✓] submission.csv ({len(sub):,} rows)")

# ── SHAP summary plot ─────────────────────────────────────────────────────────
print("\n── SHAP Summary Plot ────────────────────────────────────")
try:
    import matplotlib.pyplot as plt
    explainer = shap.TreeExplainer(fold_models[0])
    idx       = np.random.choice(len(X), size=min(200,len(X)), replace=False)
    sv        = explainer.shap_values(X.iloc[idx])
    shap.summary_plot(sv, X.iloc[idx], max_display=15, show=False)
    plt.tight_layout()
    plt.savefig(f"{SAVE_DIR}/shap_summary.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("[✓] shap_summary.png  → add to README under 'Model Explainability'")
except Exception as e:
    print(f"[!] SHAP plot skipped: {e}")

# ── Final summary ─────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("ALL DONE")
print(f"  OOF ROC-AUC       : {oof_auc:.5f}")
print(f"  OOF PR-AUC        : {pr_auc:.5f}")
print(f"  Optimal threshold : {optimal_threshold:.2f}  (F2-optimal)")
print(f"  Precision         : {prec:.4f}")
print(f"  Recall            : {rec:.4f}")
print(f"  F2                : {f2_v:.4f}")
print("="*60)
print(f"\nDownload folder: {SAVE_DIR}/")
print("Place contents into:  backend/models/")
