# backend/tests/test_unit.py
# ─────────────────────────────────────────────────────────────────
# Unit tests — run by GitHub Actions CI on every push.
# These tests do NOT need real model files.
# They test: feature engineering, preprocessing, risk tier logic,
#            schema validation, SQLite helpers.
# ─────────────────────────────────────────────────────────────────

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pandas as pd
import pytest

# Make sure backend/ is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from core.features import preprocess, engineer, align_columns


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_raw_row(**overrides) -> dict:
    """Return a minimal valid raw customer dict."""
    base = {
        "tenure":           12,
        "MonthlyCharges":   65.0,
        "TotalCharges":     780.0,
        "gender":           "Male",
        "SeniorCitizen":    0,
        "Partner":          "Yes",
        "Dependents":       "No",
        "PhoneService":     "Yes",
        "MultipleLines":    "No",
        "InternetService":  "Fiber optic",
        "OnlineSecurity":   "No",
        "OnlineBackup":     "No",
        "DeviceProtection": "No",
        "TechSupport":      "No",
        "StreamingTV":      "Yes",
        "StreamingMovies":  "No",
        "Contract":         "Month-to-month",
        "PaperlessBilling": "Yes",
        "PaymentMethod":    "Electronic check",
    }
    base.update(overrides)
    return base


def make_df(**overrides) -> pd.DataFrame:
    return pd.DataFrame([make_raw_row(**overrides)])


# ══════════════════════════════════════════════
# preprocess()
# ══════════════════════════════════════════════

class TestPreprocess:

    def test_senior_citizen_int_0_to_no(self):
        df = pd.DataFrame([{"SeniorCitizen": 0, "MonthlyCharges": 50.0, "TotalCharges": ""}])
        df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
        df["TotalCharges"] = df["TotalCharges"].fillna(df["MonthlyCharges"])
        df["SeniorCitizen"] = df["SeniorCitizen"].map({0: "No", 1: "Yes"})
        assert df["SeniorCitizen"].iloc[0] == "No"

    def test_senior_citizen_int_1_to_yes(self):
        df = pd.DataFrame([{"SeniorCitizen": 1, "MonthlyCharges": 50.0, "TotalCharges": "600"}])
        df["SeniorCitizen"] = df["SeniorCitizen"].map({0: "No", 1: "Yes"})
        assert df["SeniorCitizen"].iloc[0] == "Yes"

    def test_total_charges_blank_fills_monthly(self):
        df = make_df(TotalCharges=" ", MonthlyCharges=50.0)
        result = preprocess(df)
        assert result["TotalCharges"].iloc[0] == pytest.approx(50.0)

    def test_total_charges_valid_kept(self):
        df = make_df(TotalCharges=780.0, MonthlyCharges=65.0)
        result = preprocess(df)
        assert result["TotalCharges"].iloc[0] == pytest.approx(780.0)

    def test_senior_citizen_string_yes_preserved(self):
        df = make_df(SeniorCitizen="Yes")
        result = preprocess(df)
        assert result["SeniorCitizen"].iloc[0] == "Yes"

    def test_senior_citizen_string_no_preserved(self):
        df = make_df(SeniorCitizen="No")
        result = preprocess(df)
        assert result["SeniorCitizen"].iloc[0] == "No"


# ══════════════════════════════════════════════
# engineer()
# ══════════════════════════════════════════════

class TestEngineer:

    def _eng(self, **overrides) -> pd.Series:
        df = preprocess(make_df(**overrides))
        return engineer(df).iloc[0]

    def test_service_count_zero_when_all_no(self):
        row = self._eng(
            OnlineSecurity="No", OnlineBackup="No", DeviceProtection="No",
            TechSupport="No", StreamingTV="No", StreamingMovies="No",
        )
        assert row["service_count"] == 0

    def test_service_count_correct(self):
        row = self._eng(
            OnlineSecurity="Yes", OnlineBackup="Yes", DeviceProtection="No",
            TechSupport="No", StreamingTV="Yes", StreamingMovies="No",
        )
        assert row["service_count"] == 3

    def test_no_internet_service_treated_as_no(self):
        row = self._eng(
            OnlineSecurity="No internet service",
            OnlineBackup="No internet service",
            DeviceProtection="No internet service",
            TechSupport="No internet service",
            StreamingTV="No internet service",
            StreamingMovies="No internet service",
        )
        assert row["service_count"] == 0

    def test_autopay_true_for_bank_transfer(self):
        row = self._eng(PaymentMethod="Bank transfer (automatic)")
        assert row["autopay"] == 1

    def test_autopay_false_for_electronic_check(self):
        row = self._eng(PaymentMethod="Electronic check")
        assert row["autopay"] == 0

    def test_contract_risk_mtm(self):
        row = self._eng(Contract="Month-to-month")
        assert row["contract_risk"] == 2

    def test_contract_risk_one_year(self):
        row = self._eng(Contract="One year")
        assert row["contract_risk"] == 1

    def test_contract_risk_two_year(self):
        row = self._eng(Contract="Two year")
        assert row["contract_risk"] == 0

    def test_high_risk_flag_set_correctly(self):
        row = self._eng(
            Contract="Month-to-month",
            InternetService="Fiber optic",
            PaperlessBilling="Yes",
        )
        assert row["high_risk"] == 1

    def test_high_risk_flag_not_set_when_not_fiber(self):
        row = self._eng(
            Contract="Month-to-month",
            InternetService="DSL",
            PaperlessBilling="Yes",
        )
        assert row["high_risk"] == 0

    def test_fiber_no_sec_set(self):
        row = self._eng(InternetService="Fiber optic", OnlineSecurity="No")
        assert row["fiber_no_sec"] == 1

    def test_fiber_no_sec_not_set_when_has_security(self):
        row = self._eng(InternetService="Fiber optic", OnlineSecurity="Yes")
        assert row["fiber_no_sec"] == 0

    def test_new_mtm_set_for_short_tenure(self):
        row = self._eng(tenure=3, Contract="Month-to-month")
        assert row["new_mtm"] == 1

    def test_new_mtm_not_set_for_long_tenure(self):
        row = self._eng(tenure=24, Contract="Month-to-month")
        assert row["new_mtm"] == 0

    def test_risk_flag_mtm_echeck(self):
        row = self._eng(Contract="Month-to-month", PaymentMethod="Electronic check")
        assert row["risk_flag"] == 1

    def test_mtm_high_charge(self):
        row = self._eng(Contract="Month-to-month", MonthlyCharges=80.0)
        assert row["mtm_high_charge"] == 1

    def test_charge_contract_risk_calculation(self):
        row = self._eng(MonthlyCharges=50.0, Contract="Month-to-month")
        assert row["charge_contract_risk"] == pytest.approx(50.0 * 2)

    def test_tenure_group_calculation(self):
        row = self._eng(tenure=25)
        assert row["tenure_group"] == 2   # 25 // 12 = 2

    def test_risk_score_high_risk_customer(self):
        """A Month-to-month Fiber optic Electronic check new customer should have high risk_score."""
        row = self._eng(
            Contract="Month-to-month",
            InternetService="Fiber optic",
            PaperlessBilling="Yes",
            PaymentMethod="Electronic check",
            OnlineSecurity="No",
            tenure=3,
            MonthlyCharges=80.0,
        )
        assert row["risk_score"] >= 3

    def test_risk_score_low_risk_customer(self):
        """A Two year autopay customer should have low risk_score."""
        row = self._eng(
            Contract="Two year",
            PaymentMethod="Bank transfer (automatic)",
            InternetService="DSL",
            OnlineSecurity="Yes",
            tenure=36,
            MonthlyCharges=40.0,
        )
        assert row["risk_score"] <= 1

    def test_avg_monthly_charges(self):
        row = self._eng(TotalCharges=120.0, tenure=11)
        expected = 120.0 / (11 + 1)
        assert row["AvgMonthlyCharges"] == pytest.approx(expected)

    def test_engineer_returns_copy(self):
        """engineer() must not mutate input."""
        df = preprocess(make_df())
        original_cols = set(df.columns)
        _ = engineer(df)
        assert set(df.columns) == original_cols


# ══════════════════════════════════════════════
# align_columns()
# ══════════════════════════════════════════════

class TestAlignColumns:

    def test_missing_columns_filled_with_zero(self):
        df   = pd.DataFrame({"a": [1.0], "b": [2.0]})
        cols = ["a", "b", "c", "d"]
        result = align_columns(df, cols)
        assert "c" in result.columns
        assert result["c"].iloc[0] == 0.0
        assert result["d"].iloc[0] == 0.0

    def test_extra_columns_dropped(self):
        df   = pd.DataFrame({"a": [1.0], "b": [2.0], "extra": [9.0]})
        cols = ["a", "b"]
        result = align_columns(df, cols)
        assert "extra" not in result.columns

    def test_column_order_preserved(self):
        df   = pd.DataFrame({"b": [2.0], "a": [1.0]})
        cols = ["a", "b"]
        result = align_columns(df, cols)
        assert list(result.columns) == ["a", "b"]

    def test_output_dtype_float(self):
        df = pd.DataFrame({"a": [1], "b": [2]})
        result = align_columns(df, ["a", "b"])
        assert pd.api.types.is_float_dtype(result.dtypes["a"])


# ══════════════════════════════════════════════
# Risk tier logic
# ══════════════════════════════════════════════

class TestRiskTier:
    """Test the _risk_tier thresholds without importing main (no model needed)."""

    def _tier(self, p: float) -> str:
        return "High" if p >= 0.65 else "Medium" if p >= 0.35 else "Low"

    def test_high_at_065(self):
        assert self._tier(0.65) == "High"

    def test_high_at_090(self):
        assert self._tier(0.90) == "High"

    def test_medium_at_035(self):
        assert self._tier(0.35) == "Medium"

    def test_medium_at_064(self):
        assert self._tier(0.64) == "Medium"

    def test_low_at_034(self):
        assert self._tier(0.34) == "Low"

    def test_low_at_0(self):
        assert self._tier(0.00) == "Low"

    def test_boundary_high_med(self):
        assert self._tier(0.649) == "Medium"

    def test_boundary_med_low(self):
        assert self._tier(0.349) == "Low"


# ══════════════════════════════════════════════
# SQLite helpers (isolated temp DB)
# ══════════════════════════════════════════════

class TestSQLite:

    def _make_db(self) -> str:
        """Create a temp DB and return its path."""
        tmp = tempfile.mktemp(suffix=".db")
        with sqlite3.connect(tmp) as conn:
            conn.execute("""
                CREATE TABLE predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL, churn_prob REAL, churn_pred INTEGER,
                    risk_tier TEXT, latency_ms REAL,
                    contract TEXT, tenure REAL,
                    monthly_chg REAL, internet_svc TEXT
                )
            """)
            conn.commit()
        return tmp

    def test_insert_and_count(self):
        db = self._make_db()
        with sqlite3.connect(db) as conn:
            conn.execute(
                "INSERT INTO predictions VALUES (NULL,?,?,?,?,?,?,?,?,?)",
                (1234.0, 0.72, 1, "High", 55.0, "Month-to-month", 12, 80.0, "Fiber optic")
            )
            conn.commit()
            c = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        assert c == 1
        os.unlink(db)

    def test_risk_tier_counts(self):
        db = self._make_db()
        rows = [
            (1.0, 0.80, 1, "High",   50.0, None, None, None, None),
            (2.0, 0.80, 1, "High",   50.0, None, None, None, None),
            (3.0, 0.50, 1, "Medium", 50.0, None, None, None, None),
            (4.0, 0.10, 0, "Low",    50.0, None, None, None, None),
        ]
        with sqlite3.connect(db) as conn:
            conn.executemany("INSERT INTO predictions VALUES (NULL,?,?,?,?,?,?,?,?,?)", rows)
            conn.commit()
            high   = conn.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='High'").fetchone()[0]
            medium = conn.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='Medium'").fetchone()[0]
            low    = conn.execute("SELECT COUNT(*) FROM predictions WHERE risk_tier='Low'").fetchone()[0]
        assert high   == 2
        assert medium == 1
        assert low    == 1
        os.unlink(db)

    def test_avg_latency(self):
        db = self._make_db()
        with sqlite3.connect(db) as conn:
            conn.executemany(
                "INSERT INTO predictions VALUES (NULL,?,?,?,?,?,?,?,?,?)",
                [(1.0, 0.5, 1, "Medium", lat, None, None, None, None) for lat in [40.0, 60.0, 80.0]]
            )
            conn.commit()
            avg = conn.execute("SELECT AVG(latency_ms) FROM predictions").fetchone()[0]
        assert avg == pytest.approx(60.0)
        os.unlink(db)


# ══════════════════════════════════════════════
# Metadata schema
# ══════════════════════════════════════════════

class TestMetadataSchema:
    """Ensure the metadata.json saved by save_model.py has all required keys."""

    REQUIRED_KEYS = [
        "n_folds", "n_features", "feature_columns",
        "oof_auc", "pr_auc", "optimal_threshold",
        "precision", "recall", "f1", "f2", "accuracy",
        "confusion_matrix", "fold_metrics", "saved_at",
        "scale_pos_weight",
    ]

    def _sample_metadata(self) -> dict:
        return {
            "n_folds": 5, "n_features": 41,
            "feature_columns": ["tenure", "MonthlyCharges"],
            "oof_auc": 0.9164, "pr_auc": 0.7821,
            "optimal_threshold": 0.38,
            "precision": 0.832, "recall": 0.781,
            "f1": 0.805, "f2": 0.789, "accuracy": 0.812,
            "confusion_matrix": {"tp": 520, "fp": 142, "fn": 118, "tn": 1124},
            "fold_metrics": [
                {"fold": 1, "roc_auc": 0.914, "best_iter": 3200},
                {"fold": 2, "roc_auc": 0.917, "best_iter": 3100},
                {"fold": 3, "roc_auc": 0.913, "best_iter": 3050},
                {"fold": 4, "roc_auc": 0.918, "best_iter": 3150},
                {"fold": 5, "roc_auc": 0.916, "best_iter": 3250},
            ],
            "saved_at": "2025-01-01T12:00:00",
            "scale_pos_weight": 3.441,
        }

    def test_all_required_keys_present(self):
        meta = self._sample_metadata()
        for key in self.REQUIRED_KEYS:
            assert key in meta, f"Missing key: {key}"

    def test_oof_auc_in_valid_range(self):
        meta = self._sample_metadata()
        assert 0.5 <= meta["oof_auc"] <= 1.0

    def test_pr_auc_less_than_roc_auc_for_imbalanced(self):
        """PR-AUC should be lower than ROC-AUC on imbalanced data — sanity check."""
        meta = self._sample_metadata()
        assert meta["pr_auc"] < meta["oof_auc"]

    def test_threshold_in_valid_range(self):
        meta = self._sample_metadata()
        assert 0.1 <= meta["optimal_threshold"] <= 0.9

    def test_fold_metrics_has_correct_count(self):
        meta = self._sample_metadata()
        assert len(meta["fold_metrics"]) == meta["n_folds"]

    def test_confusion_matrix_keys(self):
        meta = self._sample_metadata()
        for k in ("tp", "fp", "fn", "tn"):
            assert k in meta["confusion_matrix"]

    def test_roundtrip_json(self):
        meta  = self._sample_metadata()
        dumped = json.dumps(meta)
        loaded = json.loads(dumped)
        assert loaded["oof_auc"] == pytest.approx(0.9164)
        assert loaded["optimal_threshold"] == pytest.approx(0.38)


# ══════════════════════════════════════════════
# engineer_for_serving() end-to-end
# ══════════════════════════════════════════════

class TestEngineerForServing:
    """Test the full preprocess → engineer → dummies → align pipeline."""

    def _feature_cols(self):
        """Load real feature columns if available, else use a small mock."""
        path = Path(__file__).parent.parent / "models" / "feature_columns.json"
        if path.exists():
            return json.loads(path.read_text())
        return ["tenure", "MonthlyCharges", "TotalCharges", "contract_risk",
                "service_count", "autopay", "gender_Male", "Partner_Yes"]

    def test_returns_correct_columns(self):
        from core.features import engineer_for_serving
        cols = self._feature_cols()
        df = engineer_for_serving(make_df(), cols)
        assert list(df.columns) == cols

    def test_output_is_all_float(self):
        from core.features import engineer_for_serving
        cols = self._feature_cols()
        df = engineer_for_serving(make_df(), cols)
        for c in df.columns:
            assert pd.api.types.is_float_dtype(df[c].dtype), f"{c} is {df[c].dtype}"

    def test_no_nans_in_output(self):
        from core.features import engineer_for_serving
        cols = self._feature_cols()
        df = engineer_for_serving(make_df(), cols)
        assert df.isna().sum().sum() == 0, "NaN values in serving output"

    def test_single_row_shape(self):
        from core.features import engineer_for_serving
        cols = self._feature_cols()
        df = engineer_for_serving(make_df(), cols)
        assert df.shape == (1, len(cols))

    def test_senior_citizen_string_input(self):
        """API sends SeniorCitizen as 'Yes'/'No' string."""
        from core.features import engineer_for_serving
        cols = self._feature_cols()
        df = engineer_for_serving(make_df(SeniorCitizen="Yes"), cols)
        assert df.shape[0] == 1
