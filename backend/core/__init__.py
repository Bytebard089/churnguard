# churnguard/backend/core/__init__.py
from __future__ import annotations

from typing import TYPE_CHECKING

from .preprocessing import get_feature_columns, get_metadata, preprocess, validate_input

__all__ = [
	"predict_churn",
	"predict_batch",
	"predict_whatif",
	"preprocess",
	"validate_input",
	"get_metadata",
	"get_feature_columns",
]


if TYPE_CHECKING:
	from .predict import predict_batch, predict_churn, predict_whatif


def __getattr__(name: str):
	if name in {"predict_churn", "predict_batch", "predict_whatif"}:
		from .predict import predict_batch, predict_churn, predict_whatif

		return {"predict_churn": predict_churn, "predict_batch": predict_batch, "predict_whatif": predict_whatif}[name]
	raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
