"""mmm-core — the frozen, tested statistical core for the MMM wizard.

Only the data-ingestion & quality layer is implemented so far (step 1 of the
build order). The Bayesian model, attribution and response-curve modules land
in later steps and get their own subpackages.
"""

from mmm_core.ingestion import (
    BuildResult,
    ColumnSpec,
    EventDummySpec,
    FeatureSpec,
    QualityIssue,
    QualityReport,
    Role,
    Severity,
    SourceSpec,
    TransformSpec,
    apply_transforms,
    build_event_dummy,
    build_feature,
    build_master_dataset,
    build_master_datasets_by_region,
)
from mmm_core.transforms import (
    adstock_weights,
    alpha_from_half_life,
    delayed_adstock,
    delayed_adstock_weights,
    geometric_adstock,
    half_life_from_alpha,
    hill_saturation,
    logistic_saturation,
    saturation_half_point,
)

__all__ = [
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
    "build_master_datasets_by_region",
    "adstock_weights",
    "alpha_from_half_life",
    "delayed_adstock",
    "delayed_adstock_weights",
    "geometric_adstock",
    "half_life_from_alpha",
    "hill_saturation",
    "logistic_saturation",
    "saturation_half_point",
]

__version__ = "0.1.0"
