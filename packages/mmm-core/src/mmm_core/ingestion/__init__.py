"""Multi-source data ingestion & quality checks for MMM.

Public surface:
    - Role / ColumnSpec / SourceSpec   — describe what each uploaded file contains.
    - EventDummySpec / build_event_dummy — declare 0/1 control columns for named weeks.
    - build_master_dataset(...)        — align sources to one ISO-week master table.
    - BuildResult                      — the aligned data + analysis window + report.
    - QualityReport / QualityIssue     — everything worth warning the builder about.
    - validate_columns(...)            — can each column play the role it was assigned?
"""

from mmm_core.ingestion.columns import (
    ColumnFinding,
    ColumnRole,
    ColumnValidation,
    looks_like_identifier,
    validate_columns,
)
from mmm_core.ingestion.events import EventDummySpec, build_event_dummy
from mmm_core.ingestion.feature_engineering import FeatureSpec, build_feature
from mmm_core.ingestion.pipeline import BuildResult, build_master_dataset
from mmm_core.ingestion.quality import QualityIssue, QualityReport, Severity
from mmm_core.ingestion.spec import ColumnSpec, Role, SourceSpec
from mmm_core.ingestion.transforms import TransformSpec, apply_transforms

__all__ = [
    "ColumnFinding",
    "ColumnRole",
    "ColumnValidation",
    "looks_like_identifier",
    "validate_columns",
    "BuildResult",
    "ColumnSpec",
    "EventDummySpec",
    "FeatureSpec",
    "QualityIssue",
    "QualityReport",
    "Role",
    "Severity",
    "SourceSpec",
    "TransformSpec",
    "apply_transforms",
    "build_event_dummy",
    "build_feature",
    "build_master_dataset",
]
