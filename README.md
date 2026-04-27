# ChurnGuard 🛡️
### Production ML System for Customer Retention Analytics

---

## Folder structure

```
churnguard/
│
├── notebooks/
│   └── save_model.py         ← STEP 0: run this in your Colab notebook
│
├── backend/
│   ├── core/
│   │   ├── __init__.py
│   │   ├── preprocessing.py  ← mirrors notebook exactly (preprocess + engineer)
│   │   └── predict.py        ← 5-fold ensemble inference + SHAP + what-if
│   │
│   ├── models/               ← paste .pkl files from Colab here
│   │   ├── fold_models.pkl
│   │   ├── feature_columns.json
│   │   ├── metadata.json
│   │   └── sample_input.json
│   │
│   ├── main.py               ← FastAPI app (Step 2)
│   └── requirements.txt
│
└── frontend/                 ← React dashboard (Step 3)
```

---

## Setup

### 0. Export from Colab
Add `notebooks/save_model.py` as the last cell of your notebook.
Add `fold_models = []` before your training loop, then `fold_models.append(model)` inside it.
Run → download `churnguard_artifacts/` → paste into `backend/models/`.

### 1. Install
```bash
cd backend
pip install -r requirements.txt
```

### 2. Test
```bash
python -m core.preprocessing   # should print: [✓] Preprocessing pipeline working correctly
python -m core.predict         # should print: [✓] Prediction pipeline working correctly
```
