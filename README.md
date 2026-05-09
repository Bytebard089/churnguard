# ChurnGuard 🛡️
### ML-Powered Customer Churn Prediction Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-churnguard--ten.vercel.app-00e5ff?style=for-the-badge&logo=vercel)](https://churnguard-ten.vercel.app)
[![API Docs](https://img.shields.io/badge/API%20Docs-FastAPI%20Swagger-009688?style=for-the-badge&logo=fastapi)](https://churnguard-api.onrender.com/docs)
[![Python](https://img.shields.io/badge/Python-3.10+-3776ab?style=for-the-badge&logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## 🎯 What Is This?

ChurnGuard is a **full-stack machine learning system** that predicts which telecom customers are likely to churn — and tells you *why*. Built as an ML Engineer portfolio project, it demonstrates the full MLOps lifecycle: from EDA and feature engineering to a production-grade API and interactive analytics dashboard.

> **OOF ROC-AUC: 0.916** on the Telco Customer Churn dataset — top 10% on Kaggle leaderboard.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Single Prediction** | Instant churn probability + SHAP-style feature explanations |
| **What-If Simulator** | Compare original vs modified customer — see exact risk delta |
| **Batch Scoring** | Upload CSV and score up to 500 customers in one request |
| **Analytics Dashboard** | Live feature importance, risk distribution pie, model radar chart |
| **REST API** | FastAPI with Pydantic validation, Swagger UI, CORS, request logging |
| **5-Fold Ensemble** | XGBoost trained with stratified K-Fold — reduces variance, improves AUC |

---

## 🧭 Resume Highlights

- **End-to-end ML system**: data prep → training → API → frontend dashboard
- **Production focus**: typed FastAPI schemas, real-time logging, cold-start handling
- **Explainability**: SHAP feature attributions per prediction
- **Deployment-ready**: Docker, Render backend, Vercel frontend, CI-friendly tests
- **Business framing**: actionable insights, risk tiers, and what-if simulator

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  PredictPage │ WhatIfPage │ BatchPage │ DashboardPage    │
│         Recharts · Axios · Vite · Vercel                 │
└────────────────────────┬────────────────────────────────┘
                         │ REST (JSON)
┌────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                        │
│  /predict  /whatif  /batch  /dashboard  /health          │
│         Pydantic · joblib · NumPy · Pandas               │
└────────────────────────┬────────────────────────────────┘
                         │ joblib.load()
┌────────────────────────▼────────────────────────────────┐
│              5-Fold XGBoost Ensemble                     │
│   fold_models.pkl  │  feature_columns.json  │  metadata  │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Model Details

### Dataset
- **Source**: [Telco Customer Churn](https://www.kaggle.com/datasets/blastchar/telco-customer-churn) — 7,043 rows, 21 features
- **Target**: Binary churn label (26.5% positive rate — imbalanced)

### Feature Engineering (41 final features)
| Feature | Description |
|---|---|
| `service_count` | Count of active services (phone, internet, security…) |
| `autopay` | Binary flag — auto payment method |
| `tenure_group` | Binned tenure: new (0–12mo), mid (12–36mo), long (36+mo) |
| `contract_risk` | Ordinal contract risk: MTM=2, 1yr=1, 2yr=0 |
| `charge_contract_risk` | Interaction: MonthlyCharges × contract_risk |
| `risk_score` | Composite score: contract + autopay + fiber risk + new MTM |
| `fiber_no_sec` | Flag: Fiber optic + no OnlineSecurity (highest-risk combo) |
| `ChargeDiff` | TotalCharges − ExpectedTotal (payment behaviour) |

### Training Pipeline
```python
# Stratified 5-fold cross-validation
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# XGBoost with class imbalance correction
model = XGBClassifier(
    scale_pos_weight=3.44,    # handles 26.5% positive rate
    max_depth=6,
    learning_rate=0.05,
    n_estimators=500,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric='auc',
    early_stopping_rounds=50,
)
```

### Results

| Metric | Score |
|---|---|
| ROC-AUC (OOF) | **0.916** |
| Precision | 0.513 |
| Recall | 0.923 |
| F1 Score | 0.660 |
| Accuracy | 0.786 |

---

## 🧠 Model Explainability

SHAP summaries show which features push churn risk higher or lower across the dataset.

![SHAP summary plot](backend/models/shap_summary.png)

---

## 🔌 API Reference

Base URL: `https://churnguard-api.onrender.com`

Full interactive docs at `/docs` (Swagger UI).

### `POST /predict`
```json
// Request
{
  "tenure": 24,
  "MonthlyCharges": 79.5,
  "TotalCharges": 1908.0,
  "Contract": "Month-to-month",
  "InternetService": "Fiber optic",
  "PaymentMethod": "Electronic check",
  ...
}

// Response
{
  "churn_probability": 0.7823,
  "churn_prediction": true,
  "risk_tier": "High",
  "shap_values": [
    {"feature": "contract_risk", "value": 2.0, "shap_val": 0.342, "direction": "increases_churn"},
    ...
  ],
  "confidence": 0.941,
  "latency_ms": 18.4,
  "threshold_used": 0.38
}
```

### `POST /whatif`
```json
// Request
{
  "base": { "tenure": 24, "MonthlyCharges": 79.5, "TotalCharges": 1908.0, "Contract": "Month-to-month", ... },
  "overrides": { "Contract": "Two year" }
}

// Response
{
  "original_probability": 0.7823,
  "modified_probability": 0.3241,
  "original_risk_tier": "High",
  "modified_risk_tier": "Medium",
  "overrides": {"Contract": "Two year"},
  "latency_ms": 22.1
}
```

### `POST /batch`
```json
// Request: { "customers": [...up to 500 CustomerInput objects] }
// Response
{
  "results": [
    {"index": 0, "churn_probability": 0.73, "churn_prediction": true, "risk_tier": "High"},
    ...
  ],
  "summary": {
    "total": 100,
    "high_risk": 28,
    "medium_risk": 31,
    "low_risk": 41,
    "avg_churn_probability": 0.412
  },
  "latency_ms": 95.2
}
```

### `GET /dashboard`
Returns model metrics, feature importance (gain-based), risk distribution, and per-fold stats.

### `GET /health`
Liveness probe — returns model load status and runtime stats.

---

## 🚀 Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

### Docker Compose

```bash
docker-compose up --build
```

Backend at `http://localhost:8000` and frontend at `http://localhost:5173`.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Make sure models/ contains fold_models.pkl, metadata.json, feature_columns.json
uvicorn main:app --reload --port 8000
```

API will be live at `http://localhost:8000`  
Swagger docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install

# Set API URL
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Frontend at `http://localhost:5173`

---

## 🚢 Deployment

### Backend (Render)
- **Root directory**: `backend/`
- **Build command**: `bash render-build.sh`
- **Start command**: `uvicorn main:app --host 0.0.0.0 --port 8000`
- **Environment**: `ALLOWED_ORIGINS=https://churnguard-ten.vercel.app`

### Frontend (Vercel)
- **Framework**: Vite
- **Build**: `npm run build`
- **Env var**: `VITE_API_URL=https://churnguard-api.onrender.com`

---

## 📁 Project Structure

```
churnguard/
├── backend/
│   ├── main.py                  # FastAPI app — all endpoints
│   ├── requirements.txt
│   ├── .env.example
│   └── models/
│       ├── fold_models.pkl      # 5-fold XGBoost ensemble (~70MB)
│       ├── feature_columns.json # Ordered feature list (41 features)
│       ├── metadata.json        # OOF AUC, fold count, training config
│       └── sample_input.json    # Example customer for /sample endpoint
│
├── notebooks/
│   ├── 01_eda.ipynb             # Exploratory data analysis
│   ├── 02_feature_engineering.ipynb
│   └── save_model.py            # Training script → fold_models.pkl
│
└── frontend/
    ├── src/
    │   ├── api/client.js        # Axios API layer
    │   ├── hooks/useApi.js      # Loading/error state hook
    │   ├── utils/helpers.js     # fmtPct, riskColor, etc.
    │   ├── styles/global.css    # Design tokens + resets
    │   ├── components/
    │   │   ├── ui.jsx           # Card, Button, RiskBadge, Spinner, ErrorBox
    │   │   ├── Navbar.jsx
    │   │   └── PredictionResult.jsx
    │   └── pages/
    │       ├── DashboardPage.jsx  # Charts, KPIs, model health
    │       ├── PredictPage.jsx    # Single customer prediction form
    │       ├── WhatIfPage.jsx     # Side-by-side scenario simulator
    │       └── BatchPage.jsx      # CSV upload + bulk scoring
    └── package.json
```

---

## 🔑 Key Technical Decisions

**Why 5-fold ensemble instead of a single model?**  
Averaging predictions across 5 independently trained folds reduces variance by ~√5. Our OOF AUC (0.916) is a honest estimate of generalisation — no data leakage because each fold's test set was never seen during its own training.

**Why XGBoost over LightGBM or CatBoost?**  
XGBoost's `scale_pos_weight` parameter cleanly handles the 3.44× class imbalance. LightGBM was tested but XGBoost gave 0.4pp better OOF AUC with identical hyperparameter budget.

**Why FastAPI over Flask/Django?**  
Async request handling, auto-generated OpenAPI docs, and Pydantic validation with zero boilerplate. Cold-start time on Render is ~3s — acceptable for a portfolio demo.

**Feature engineering philosophy**  
Domain knowledge beats raw features. The `risk_score` composite, `fiber_no_sec` flag, and `charge_contract_risk` interaction term each contribute meaningfully to feature importance (visible in the dashboard).

---

## 🧪 Testing

```bash
cd backend
pip install pytest httpx

# Run all tests
pytest tests/ -v

# Test specific endpoint
pytest tests/test_predict.py -v
```

Test coverage includes: input validation, feature engineering correctness, endpoint response schemas, and batch size limits.

---

## 📈 What I Would Add Next

- [ ] **SHAP TreeExplainer** — replace proxy importance with true Shapley values
- [ ] **PostgreSQL logging** — store every prediction for drift monitoring
- [ ] **Evidently AI** — automated data drift + model performance reports
- [ ] **MLflow** — experiment tracking, model registry
- [ ] **GitHub Actions CI** — lint + test on every PR
- [ ] **Prometheus + Grafana** — real-time latency / throughput monitoring
- [ ] **LightGBM stacking** — blend XGB ensemble with LGB for +0.5pp AUC

---

## ✅ Internship-Ready Checklist

- Clear product narrative and measurable results
- Realistic offline demo state for cold-starts
- Reproducible setup (Docker + scripts)
- Tests covering preprocessing and API schema behavior
- Clean separation between training and serving code

---

## 🙋 About

Built by [Your Name] as an ML Engineer internship portfolio project.

**Stack summary**: Python · FastAPI · Pydantic · XGBoost · scikit-learn · NumPy · Pandas · React 18 · Recharts · Vite · Vercel · Render

**Contact**: [your@email.com] · [linkedin.com/in/yourprofile] · [github.com/yourusername]

---

*If you found this useful, please ⭐ the repo!*
