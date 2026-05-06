"""
ChurnGuard API — main.py  (v3.0)
=================================
Fixes vs v2.0:
  Fix 1 — engineer_for_serving() imported from core/features.py
  Fix 2 — real SHAP via shap.TreeExplainer (not gain proxy)
  Fix 3 — SQLite logs every prediction; /dashboard reads real data
  Fix 4 — optimal_threshold loaded from metadata.json (not hardcoded 0.5)
"""
from __future__ import annotations

import json, logging, os, sqlite3, time, traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Union

import joblib, numpy as np, pandas as pd, shap
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("churnguard")

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
MODELS_DIR  = BASE_DIR / "models"
MODEL_PATH  = MODELS_DIR / "fold_models.pkl"
META_PATH   = MODELS_DIR / "metadata.json"
FEAT_PATH   = MODELS_DIR / "feature_columns.json"
SAMPLE_PATH = MODELS_DIR / "sample_input.json"
DB_PATH     = BASE_DIR / "predictions.db"

# ─── Global state ─────────────────────────────────────────────────────────────
_models:       list[Any] = []
_metadata:     dict      = {}
_feature_cols: list[str] = []
_explainer:    Any       = None
_threshold:    float     = 0.5


# ─── Fix 3: SQLite ────────────────────────────────────────────────────────────
def _init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ts           REAL    NOT NULL,
                churn_prob   REAL    NOT NULL,
                churn_pred   INTEGER NOT NULL,
                risk_tier    TEXT    NOT NULL,
                latency_ms   REAL    NOT NULL,
                contract     TEXT,
                tenure       REAL,
                monthly_chg  REAL,
                internet_svc TEXT
            )
        """)
        conn.commit()
    log.info("SQLite DB ready at %s", DB_PATH)


def _log_prediction(prob, pred, tier, latency_ms, cust):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO predictions (ts,churn_prob,churn_pred,risk_tier,latency_ms,"
                "contract,tenure,monthly_chg,internet_svc) VALUES (?,?,?,?,?,?,?,?,?)",
                (time.time(), round(prob,4), int(pred), tier, round(latency_ms,2),
                 cust.get("Contract"), cust.get("tenure"),
                 cust.get("MonthlyCharges"), cust.get("InternetService")),
            )
            conn.commit()
    except Exception as e:
        log.warning("DB log failed: %s", e)


def _db_stats() -> dict:
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM predictions"); total  = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='High'");   high   = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='Medium'"); medium = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='Low'");    low    = c.fetchone()[0]
            c.execute("SELECT AVG(latency_ms) FROM predictions"); avg_lat  = c.fetchone()[0] or 0.0
            c.execute("SELECT AVG(churn_prob) FROM predictions"); avg_prob = c.fetchone()[0] or 0.0
            c.execute("SELECT ts,churn_prob,risk_tier FROM predictions ORDER BY ts DESC LIMIT 20")
            recent = [{"ts":r[0],"churn_prob":r[1],"risk_tier":r[2]} for r in c.fetchall()]
        return {"total":total,"high":high,"medium":medium,"low":low,
                "avg_latency_ms":round(avg_lat,2),"avg_churn_prob":round(avg_prob,4),"recent":recent}
    except Exception as e:
        log.warning("DB stats failed: %s", e)
        return {"total":0,"high":0,"medium":0,"low":0,"avg_latency_ms":0,"avg_churn_prob":0,"recent":[]}


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _models, _metadata, _feature_cols, _explainer, _threshold
    log.info("Loading artifacts …")
    _models       = joblib.load(MODEL_PATH)
    _metadata     = json.loads(META_PATH.read_text())
    _feature_cols = json.loads(FEAT_PATH.read_text())
    _threshold    = float(_metadata.get("optimal_threshold", 0.5))  # Fix 4
    log.info("Loaded %d models | %d features | OOF AUC %.4f | threshold %.3f",
             len(_models), len(_feature_cols), _metadata.get("oof_auc",0), _threshold)
    log.info("Building SHAP explainer …")
    _explainer = shap.TreeExplainer(_models[0])   # Fix 2
    log.info("SHAP ready")
    _init_db()                                     # Fix 3
    yield
    log.info("Shutdown.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="ChurnGuard API", version="3.0.0", lifespan=lifespan,
    description="5-fold XGBoost churn prediction. Fixes: real SHAP, SQLite, calibrated threshold.")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://churnguard-ten.vercel.app,http://localhost:5173,http://localhost:3000",
).split(",")

app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    log.info("%s %s → %d  (%.1f ms)", request.method, request.url.path,
             response.status_code, (time.perf_counter()-t0)*1000)
    return response


# ─── Schemas ──────────────────────────────────────────────────────────────────
class CustomerInput(BaseModel):
    tenure: float           = Field(..., ge=0, le=120)
    MonthlyCharges: float   = Field(..., ge=0)
    TotalCharges: float     = Field(..., ge=0)
    gender: str
    SeniorCitizen: Union[str, int]
    Partner: str
    Dependents: str
    PhoneService: str
    MultipleLines: str
    InternetService: str
    OnlineSecurity: str
    OnlineBackup: str
    DeviceProtection: str
    TechSupport: str
    StreamingTV: str
    StreamingMovies: str
    Contract: str
    PaperlessBilling: str
    PaymentMethod: str

    @validator("gender")
    def v_gender(cls, v):
        if v not in ("Male","Female"): raise ValueError("gender must be Male or Female")
        return v

    @validator("Contract")
    def v_contract(cls, v):
        if v not in {"Month-to-month","One year","Two year"}:
            raise ValueError("Invalid contract")
        return v

    @validator("SeniorCitizen", pre=True)
    def v_senior(cls, v):
        if v in (1,"1","Yes"): return "Yes"
        if v in (0,"0","No"):  return "No"
        raise ValueError("SeniorCitizen must be 0/1/Yes/No")


class PredictionResponse(BaseModel):
    churn_probability: float
    churn_prediction:  bool
    risk_tier:         str
    shap_values:       list[dict]
    confidence:        float
    latency_ms:        float
    threshold_used:    float     # Fix 4: transparency


class WhatIfRequest(BaseModel):
    base:      CustomerInput
    overrides: dict = Field(default_factory=dict)


class WhatIfResponse(BaseModel):
    original_probability: float
    modified_probability: float
    original_risk_tier:   str
    modified_risk_tier:   str
    overrides:            dict
    latency_ms:           float


class BatchRequest(BaseModel):
    customers: list[CustomerInput]


class BatchResponse(BaseModel):
    results:   list[dict]
    summary:   dict
    latency_ms: float


# ─── Fix 1: feature engineering from single source of truth ───────────────────
from core.features import engineer_for_serving  # noqa: E402


def _featurize(d: dict) -> pd.DataFrame:
    return engineer_for_serving(pd.DataFrame([d]), _feature_cols)


# ─── Inference helpers ────────────────────────────────────────────────────────
def _predict_proba(feat_df: pd.DataFrame) -> np.ndarray:
    return np.array([m.predict_proba(feat_df)[:,1] for m in _models]).mean(axis=0)


def _risk_tier(p: float) -> str:
    return "High" if p >= 0.65 else "Medium" if p >= 0.35 else "Low"


def _get_shap(feat_df: pd.DataFrame, n: int = 8) -> list[dict]:
    """Fix 2: real per-prediction Shapley values from shap.TreeExplainer."""
    try:
        sv   = _explainer.shap_values(feat_df)[0]   # shape: (n_features,)
        out  = [
            {"feature":   name.replace("_"," "),
             "shap_val":  round(float(v), 5),
             "direction": "increases_churn" if v > 0 else "decreases_churn",
             "value":     round(float(feat_df.iloc[0][name]), 4)}
            for name, v in zip(_feature_cols, sv)
        ]
        out.sort(key=lambda x: -abs(x["shap_val"]))
        return out[:n]
    except Exception as e:
        log.warning("SHAP failed, using gain fallback: %s", e)
        scores = _models[0].get_booster().get_score(importance_type="gain")
        total  = sum(scores.values()) or 1
        return sorted([{"feature":k,"shap_val":round(v/total,5),
                        "direction":"increases_churn","value":0.0}
                       for k,v in scores.items()],
                      key=lambda x:-abs(x["shap_val"]))[:n]


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
def health_check():
    db = _db_stats()
    return {"status":"healthy","model_ready":len(_models)>0,"models_loaded":len(_models),
            "features":len(_feature_cols),"oof_auc":_metadata.get("oof_auc"),
            "pr_auc":_metadata.get("pr_auc"),"optimal_threshold":_threshold,
            "total_predictions":db["total"]}


@app.get("/sample", tags=["utils"])
def get_sample():
    try:    return json.loads(SAMPLE_PATH.read_text())
    except Exception as e: raise HTTPException(500, str(e))


@app.get("/features", tags=["utils"])
def get_features():
    try:    sample = json.loads(SAMPLE_PATH.read_text())
    except: sample = {}
    d = lambda k, fb=None: sample.get(k, fb)
    return [
        {"field":"tenure","label":"Tenure (months)","type":"number","group":"Account","min":0,"max":120,"default":d("tenure")},
        {"field":"Contract","label":"Contract","type":"select","group":"Account","options":["Month-to-month","One year","Two year"],"default":d("Contract")},
        {"field":"PaperlessBilling","label":"Paperless Billing","type":"select","group":"Account","options":["Yes","No"],"default":d("PaperlessBilling")},
        {"field":"PaymentMethod","label":"Payment Method","type":"select","group":"Account","options":["Electronic check","Mailed check","Bank transfer (automatic)","Credit card (automatic)"],"default":d("PaymentMethod")},
        {"field":"MonthlyCharges","label":"Monthly Charges","type":"number","group":"Charges","min":0,"max":500,"default":d("MonthlyCharges")},
        {"field":"TotalCharges","label":"Total Charges","type":"number","group":"Charges","min":0,"default":d("TotalCharges")},
        {"field":"gender","label":"Gender","type":"select","group":"Demographics","options":["Male","Female"],"default":d("gender")},
        {"field":"SeniorCitizen","label":"Senior Citizen","type":"select","group":"Demographics","options":["Yes","No"],"default":d("SeniorCitizen")},
        {"field":"Partner","label":"Partner","type":"select","group":"Demographics","options":["Yes","No"],"default":d("Partner")},
        {"field":"Dependents","label":"Dependents","type":"select","group":"Demographics","options":["Yes","No"],"default":d("Dependents")},
        {"field":"PhoneService","label":"Phone Service","type":"select","group":"Services","options":["Yes","No"],"default":d("PhoneService")},
        {"field":"MultipleLines","label":"Multiple Lines","type":"select","group":"Services","options":["Yes","No","No phone service"],"default":d("MultipleLines")},
        {"field":"InternetService","label":"Internet Service","type":"select","group":"Services","options":["DSL","Fiber optic","No"],"default":d("InternetService")},
        {"field":"OnlineSecurity","label":"Online Security","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("OnlineSecurity")},
        {"field":"OnlineBackup","label":"Online Backup","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("OnlineBackup")},
        {"field":"DeviceProtection","label":"Device Protection","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("DeviceProtection")},
        {"field":"TechSupport","label":"Tech Support","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("TechSupport")},
        {"field":"StreamingTV","label":"Streaming TV","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("StreamingTV")},
        {"field":"StreamingMovies","label":"Streaming Movies","type":"select","group":"Services","options":["Yes","No","No internet service"],"default":d("StreamingMovies")},
    ]


@app.post("/predict", response_model=PredictionResponse, tags=["inference"])
def predict(customer: CustomerInput):
    t0 = time.perf_counter()
    try:
        cd         = customer.dict()
        feat_df    = _featurize(cd)
        fold_preds = np.array([m.predict_proba(feat_df)[:,1] for m in _models])
        prob       = float(fold_preds.mean())
        confidence = float(1 - fold_preds.std())
        tier       = _risk_tier(prob)
        shap_out   = _get_shap(feat_df)
        latency_ms = (time.perf_counter() - t0) * 1000
        _log_prediction(prob, prob >= _threshold, tier, latency_ms, cd)  # Fix 3
        log.info("predict → %.3f (%s)  threshold=%.2f  %.1fms", prob, tier, _threshold, latency_ms)
        return PredictionResponse(
            churn_probability=round(prob,4), churn_prediction=prob>=_threshold,  # Fix 4
            risk_tier=tier, shap_values=shap_out, confidence=round(confidence,4),
            latency_ms=round(latency_ms,2), threshold_used=_threshold)
    except Exception as e:
        log.error("predict error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(500, str(e))


@app.post("/whatif", response_model=WhatIfResponse, tags=["inference"])
def what_if(payload: WhatIfRequest):
    t0 = time.perf_counter()
    try:
        orig = payload.base.dict()
        mod  = {**orig, **payload.overrides}
        op   = float(_predict_proba(_featurize(orig))[0])
        mp   = float(_predict_proba(_featurize(mod))[0])
        ms   = (time.perf_counter()-t0)*1000
        log.info("whatif → orig=%.3f mod=%.3f Δ=%.3f  %.1fms", op, mp, mp-op, ms)
        return WhatIfResponse(original_probability=round(op,4), modified_probability=round(mp,4),
            original_risk_tier=_risk_tier(op), modified_risk_tier=_risk_tier(mp),
            overrides=payload.overrides, latency_ms=round(ms,2))
    except Exception as e:
        log.error("whatif error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(500, str(e))


@app.post("/batch", response_model=BatchResponse, tags=["inference"])
def batch_predict(req: BatchRequest):
    t0 = time.perf_counter()
    if len(req.customers) > 500: raise HTTPException(400, "Max 500 customers")
    if not req.customers:        raise HTTPException(400, "Empty list")
    try:
        feat_df = engineer_for_serving(pd.DataFrame([c.dict() for c in req.customers]), _feature_cols)
        probs   = _predict_proba(feat_df)
        tiers   = [_risk_tier(p) for p in probs]
        results = [{"index":i,"churn_probability":round(float(p),4),
                    "churn_prediction":bool(p>=_threshold),"risk_tier":t}
                   for i,(p,t) in enumerate(zip(probs,tiers))]
        h,m,l,n = (sum(1 for t in tiers if t==x) for x in ("High","Medium","Low")), len(results)
        high,med,low = sum(1 for t in tiers if t=="High"), sum(1 for t in tiers if t=="Medium"), sum(1 for t in tiers if t=="Low")
        ms = (time.perf_counter()-t0)*1000
        log.info("batch %d → H=%d M=%d L=%d  %.1fms", len(results), high, med, low, ms)
        return BatchResponse(results=results, latency_ms=round(ms,2), summary={
            "total":len(results),"high_risk":high,"medium_risk":med,"low_risk":low,
            "high_risk_pct":round(high/len(results)*100,1),
            "avg_churn_probability":round(float(probs.mean()),4),"latency_ms":round(ms,2)})
    except Exception as e:
        log.error("batch error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(500, str(e))


@app.get("/dashboard", tags=["analytics"])
def dashboard():
    """Fix 3: all stats from real SQLite. Fix 4: real metrics from metadata.json."""
    try:
        db     = _db_stats()
        scores = _models[0].get_booster().get_score(importance_type="gain")
        tot    = sum(scores.values()) or 1
        fi     = sorted([{"feature":k,"importance":round(v/tot,5)} for k,v in scores.items()],
                        key=lambda x:-x["importance"])
        total  = max(db["total"], 1)
        return {
            "model_metrics": {
                "roc_auc":           round(_metadata.get("oof_auc",0), 4),
                "pr_auc":            round(_metadata.get("pr_auc",0), 4),
                "precision":         round(_metadata.get("precision",0), 4),
                "recall":            round(_metadata.get("recall",0), 4),
                "f1":                round(_metadata.get("f1",0), 4),
                "f2":                round(_metadata.get("f2",0), 4),
                "accuracy":          round(_metadata.get("accuracy",0), 4),
                "optimal_threshold": round(_metadata.get("optimal_threshold",0.5), 4),
            },
            "risk_distribution": {
                "high":db["high"],"medium":db["medium"],"low":db["low"],"total":db["total"],
                "high_pct":  round(db["high"]/total*100,1),
                "medium_pct":round(db["medium"]/total*100,1),
                "low_pct":   round(db["low"]/total*100,1),
            },
            "feature_importance": fi[:15],
            "prediction_stats": {
                "total":db["total"],"avg_latency_ms":db["avg_latency_ms"],
                "avg_churn_prob":db["avg_churn_prob"],"recent":db["recent"],
            },
            "model_health": {
                "status":"healthy","n_folds":_metadata.get("n_folds",5),
                "fold_metrics":_metadata.get("fold_metrics",[]),
                "optimal_threshold":_metadata.get("optimal_threshold",0.5),
            },
        }
    except Exception as e:
        log.error("dashboard error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(500, str(e))


@app.exception_handler(Exception)
async def global_exc(request: Request, exc: Exception):
    log.error("Unhandled on %s: %s", request.url.path, exc)
    return JSONResponse(500, {"detail": "Internal server error"})
