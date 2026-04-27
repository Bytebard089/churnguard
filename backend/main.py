"""
churnguard/backend/main.py

FastAPI backend for ChurnGuard.
Endpoints:
  GET  /health          — health check + model info
  POST /predict         — single customer prediction + SHAP
  POST /batch           — CSV upload, bulk predictions
  POST /whatif          — what-if simulator
  GET  /sample          — returns a sample input for testing
  GET  /features        — returns field definitions for the frontend form
"""

import io
import os
import json
import time
import logging
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("churnguard")

# ── Startup: pre-load models so first request isn't slow ─────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("ChurnGuard starting — pre-loading models...")
    try:
        from core.predict import get_fold_models, get_explainer
        models = get_fold_models()
        get_explainer()
        log.info(f"Loaded {len(models)} fold models + SHAP explainer ✓")
    except FileNotFoundError as e:
        log.warning(f"Models not found at startup: {e}")
        log.warning("Place model artifacts in backend/models/ and restart.")
    yield
    log.info("ChurnGuard shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ChurnGuard API",
    description="Customer churn prediction with SHAP explainability",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend (port 5173 = Vite default)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        os.environ.get("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ───────────────────────────────────────────────────

class CustomerInput(BaseModel):
    """
    Raw customer features — matches the Telco dataset columns exactly.
    All fields are required for prediction.
    """
    gender:           str   = Field(..., example="Male")
    SeniorCitizen:    int   = Field(..., ge=0, le=1, example=0)
    Partner:          str   = Field(..., example="Yes")
    Dependents:       str   = Field(..., example="No")
    tenure:           float = Field(..., ge=0, le=120, example=24)
    PhoneService:     str   = Field(..., example="Yes")
    MultipleLines:    str   = Field(..., example="No")
    InternetService:  str   = Field(..., example="Fiber optic")
    OnlineSecurity:   str   = Field(..., example="No")
    OnlineBackup:     str   = Field(..., example="Yes")
    DeviceProtection: str   = Field(..., example="No")
    TechSupport:      str   = Field(..., example="No")
    StreamingTV:      str   = Field(..., example="Yes")
    StreamingMovies:  str   = Field(..., example="Yes")
    Contract:         str   = Field(..., example="Month-to-month")
    PaperlessBilling: str   = Field(..., example="Yes")
    PaymentMethod:    str   = Field(..., example="Electronic check")
    MonthlyCharges:   float = Field(..., gt=0, le=500, example=79.85)
    TotalCharges:     float = Field(..., ge=0, example=1889.50)

    @field_validator("Contract")
    @classmethod
    def validate_contract(cls, v):
        valid = ["Month-to-month", "One year", "Two year"]
        if v not in valid:
            raise ValueError(f"Contract must be one of {valid}")
        return v

    @field_validator("InternetService")
    @classmethod
    def validate_internet(cls, v):
        valid = ["DSL", "Fiber optic", "No"]
        if v not in valid:
            raise ValueError(f"InternetService must be one of {valid}")
        return v

    @field_validator("PaymentMethod")
    @classmethod
    def validate_payment(cls, v):
        valid = [
            "Electronic check", "Mailed check",
            "Bank transfer (automatic)", "Credit card (automatic)"
        ]
        if v not in valid:
            raise ValueError(f"PaymentMethod must be one of {valid}")
        return v

    def to_dict(self) -> dict:
        return self.model_dump()


class WhatIfInput(BaseModel):
    customer:  CustomerInput
    overrides: dict = Field(..., example={"Contract": "Two year"})


class PredictionResponse(BaseModel):
    churn_probability:   float
    churn_predicted:     bool
    risk_tier:           str
    confidence:          str
    shap_values:         list
    fold_probabilities:  list
    model_version:       str
    latency_ms:          float


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Health check. Returns model status and metadata."""
    try:
        from core.predict import get_fold_models
        from core.preprocessing import get_metadata, get_feature_columns
        models   = get_fold_models()
        meta     = get_metadata()
        n_feats  = len(get_feature_columns())
        return {
            "status":         "ok",
            "models_loaded":  len(models),
            "n_features":     n_feats,
            "oof_auc":        meta.get("oof_auc"),
            "model_version":  os.environ.get("MODEL_VERSION", "v1.0-5fold"),
            "timestamp":      datetime.utcnow().isoformat(),
        }
    except FileNotFoundError:
        return {
            "status":  "degraded",
            "message": "Model artifacts not found. See backend/models/README.md",
        }


@app.get("/sample")
def get_sample():
    """
    Returns a sample customer input.
    Used by the frontend to pre-fill the form for demos.
    """
    sample_path = Path(__file__).parent / "models" / "sample_input.json"
    if not sample_path.exists():
        # Return a hardcoded fallback so the frontend always works
        return _hardcoded_sample()
    return json.loads(sample_path.read_text())


@app.get("/features")
def get_features():
    """
    Returns field definitions for the frontend form builder.
    Each field includes type, label, and valid options.
    """
    return FIELD_DEFINITIONS


@app.post("/predict", response_model=PredictionResponse)
def predict(customer: CustomerInput, request: Request):
    """
    Predict churn probability for a single customer.
    Returns probability, risk tier, SHAP explanation, and fold agreement.
    """
    t0 = time.perf_counter()
    log.info(f"POST /predict  tenure={customer.tenure}  contract={customer.Contract}")

    try:
        from core.predict import predict_churn
        result = predict_churn(customer.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        log.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    latency = round((time.perf_counter() - t0) * 1000, 2)
    log.info(f"  → prob={result['churn_probability']}  tier={result['risk_tier']}  {latency}ms")

    return {**result, "latency_ms": latency}


@app.post("/whatif")
def whatif(body: WhatIfInput):
    """
    What-if simulator.
    Send a customer + a dict of field overrides.
    Returns original vs modified prediction + probability delta.

    Example body:
    {
      "customer": { ...all fields... },
      "overrides": { "Contract": "Two year", "PaymentMethod": "Bank transfer (automatic)" }
    }
    """
    t0 = time.perf_counter()
    log.info(f"POST /whatif  overrides={list(body.overrides.keys())}")

    try:
        from core.predict import predict_whatif
        result = predict_whatif(body.customer.to_dict(), body.overrides)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log.error(f"What-if error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    latency = round((time.perf_counter() - t0) * 1000, 2)
    return {**result, "latency_ms": latency}


@app.post("/batch")
async def batch_predict(file: UploadFile = File(...)):
    """
    Batch prediction from CSV upload.
    CSV must have the same column headers as CustomerInput.
    Returns a downloadable CSV with churn_probability and risk_tier appended.

    Usage (curl):
      curl -X POST http://localhost:8000/batch \
           -F "file=@customers.csv" \
           --output predictions.csv
    """
    log.info(f"POST /batch  filename={file.filename}  size={file.size}")

    # 1. Read uploaded CSV
    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    # 2. Validate columns
    required = [
        "gender","SeniorCitizen","Partner","Dependents","tenure",
        "PhoneService","MultipleLines","InternetService","OnlineSecurity",
        "OnlineBackup","DeviceProtection","TechSupport","StreamingTV",
        "StreamingMovies","Contract","PaperlessBilling","PaymentMethod",
        "MonthlyCharges","TotalCharges"
    ]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing columns: {missing_cols}"
        )

    # 3. Run predictions
    try:
        from core.predict import predict_batch
        rows    = df[required].to_dict(orient="records")
        results = predict_batch(rows)
    except Exception as e:
        log.error(f"Batch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # 4. Append results to original CSV
    df["churn_probability"] = [r.get("churn_probability") for r in results]
    df["churn_predicted"]   = [r.get("churn_predicted")   for r in results]
    df["risk_tier"]         = [r.get("risk_tier")          for r in results]
    df["confidence"]        = [r.get("confidence")         for r in results]
    df["prediction_error"]  = [r.get("error", "")          for r in results]

    # 5. Return as downloadable CSV
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    log.info(f"  → batch done: {len(df)} rows")

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=churnguard_predictions.csv"},
    )


# ── Field definitions (used by frontend form) ─────────────────────────────────

FIELD_DEFINITIONS = [
    # Account info
    {
        "group":   "Account",
        "field":   "tenure",
        "label":   "Tenure (months)",
        "type":    "number",
        "min":     0, "max": 120,
        "default": 24,
    },
    {
        "group":   "Account",
        "field":   "Contract",
        "label":   "Contract Type",
        "type":    "select",
        "options": ["Month-to-month", "One year", "Two year"],
        "default": "Month-to-month",
    },
    {
        "group":   "Account",
        "field":   "PaperlessBilling",
        "label":   "Paperless Billing",
        "type":    "select",
        "options": ["Yes", "No"],
        "default": "Yes",
    },
    {
        "group":   "Account",
        "field":   "PaymentMethod",
        "label":   "Payment Method",
        "type":    "select",
        "options": [
            "Electronic check", "Mailed check",
            "Bank transfer (automatic)", "Credit card (automatic)"
        ],
        "default": "Electronic check",
    },
    # Charges
    {
        "group":   "Charges",
        "field":   "MonthlyCharges",
        "label":   "Monthly Charges ($)",
        "type":    "number",
        "min":     0, "max": 200,
        "default": 65.0,
    },
    {
        "group":   "Charges",
        "field":   "TotalCharges",
        "label":   "Total Charges ($)",
        "type":    "number",
        "min":     0, "max": 10000,
        "default": 1500.0,
    },
    # Demographics
    {
        "group":   "Demographics",
        "field":   "gender",
        "label":   "Gender",
        "type":    "select",
        "options": ["Male", "Female"],
        "default": "Male",
    },
    {
        "group":   "Demographics",
        "field":   "SeniorCitizen",
        "label":   "Senior Citizen",
        "type":    "select",
        "options": [0, 1],
        "optionLabels": ["No", "Yes"],
        "default": 0,
    },
    {
        "group":   "Demographics",
        "field":   "Partner",
        "label":   "Has Partner",
        "type":    "select",
        "options": ["Yes", "No"],
        "default": "No",
    },
    {
        "group":   "Demographics",
        "field":   "Dependents",
        "label":   "Has Dependents",
        "type":    "select",
        "options": ["Yes", "No"],
        "default": "No",
    },
    # Services
    {
        "group":   "Services",
        "field":   "PhoneService",
        "label":   "Phone Service",
        "type":    "select",
        "options": ["Yes", "No"],
        "default": "Yes",
    },
    {
        "group":   "Services",
        "field":   "MultipleLines",
        "label":   "Multiple Lines",
        "type":    "select",
        "options": ["Yes", "No", "No phone service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "InternetService",
        "label":   "Internet Service",
        "type":    "select",
        "options": ["DSL", "Fiber optic", "No"],
        "default": "Fiber optic",
    },
    {
        "group":   "Services",
        "field":   "OnlineSecurity",
        "label":   "Online Security",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "OnlineBackup",
        "label":   "Online Backup",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "DeviceProtection",
        "label":   "Device Protection",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "TechSupport",
        "label":   "Tech Support",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "StreamingTV",
        "label":   "Streaming TV",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
    {
        "group":   "Services",
        "field":   "StreamingMovies",
        "label":   "Streaming Movies",
        "type":    "select",
        "options": ["Yes", "No", "No internet service"],
        "default": "No",
    },
]


def _hardcoded_sample() -> dict:
    """Fallback sample when sample_input.json is not present."""
    return {
        "gender": "Female", "SeniorCitizen": 0, "Partner": "Yes",
        "Dependents": "No", "tenure": 24,
        "PhoneService": "Yes", "MultipleLines": "No",
        "InternetService": "Fiber optic", "OnlineSecurity": "No",
        "OnlineBackup": "Yes", "DeviceProtection": "No",
        "TechSupport": "No", "StreamingTV": "Yes", "StreamingMovies": "Yes",
        "Contract": "Month-to-month", "PaperlessBilling": "Yes",
        "PaymentMethod": "Electronic check",
        "MonthlyCharges": 79.85, "TotalCharges": 1889.5,
    }


# ── Dev server ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,          # auto-restart on code changes
        log_level="info",
    )
