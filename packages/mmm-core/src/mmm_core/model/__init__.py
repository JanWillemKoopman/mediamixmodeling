"""The Bayesian MMM model: intent, measured statistics, derived priors, and the fit.

The layering here is deliberate and is the main architectural guarantee of this package:

    ModelIntent   (what a human or an AI believes — ordinal words, no numbers)
        + DatasetStatistics   (what the data actually is — measured, deterministic)
        -> build_model_config -> ModelConfig   (the numbers the sampler runs on)
        -> build_model -> PyMC graph -> fit_model -> FitSummary

Nothing downstream of ``build_model_config`` accepts free-form input, and nothing upstream
of it produces a number. That is what keeps a language model from being able to make the
statistics wrong, however confidently it words its answer.

Importing this package is cheap: the heavy PyMC/numpyro/ArviZ stack is only imported
inside :func:`mmm_core.model.build.build_model` / :func:`mmm_core.model.fit.fit_model`,
so intent, statistics, priors, simulation and validation stay usable without the model
extra installed.
"""

from mmm_core.model.config import (
    AdstockType,
    BaselinePriors,
    ChannelConfig,
    ChannelPriors,
    ChannelType,
    ChannelUnit,
    KpiType,
    LikelihoodType,
    ModelConfig,
    RoasCalibration,
    SaturationType,
    TrendType,
    default_half_life,
)
from mmm_core.model.datastats import (
    MIN_ACTIVE_WEEKS,
    MIN_CHANNEL_CV,
    ChannelStatistics,
    DatasetStatistics,
    is_effectively_constant,
    measure_dataset,
)
from mmm_core.model.intent import (
    Carryover,
    ChannelIntent,
    ChannelRole,
    MediaShare,
    ModelIntent,
    SaturationBelief,
    SeasonalityBelief,
    Strength,
)
from mmm_core.model.priors import (
    ConfigIssue,
    PriorProvenance,
    ResolvedModel,
    build_model_config,
    burn_in_for,
    likelihood_for,
    required_burn_in,
    widen_priors,
)
from mmm_core.model.identify import (
    ChannelIdentifiability,
    IdentifiabilityReport,
    assess_identifiability,
    prior_effect_samples,
    prior_sensitivity_shift,
)
from mmm_core.model.simulate import (
    ChannelDGP,
    SimulatedDataset,
    TrueChannel,
    simulate_mmm,
)
from mmm_core.model.validate import (
    ModelValidation,
    Output,
    ValidationLevel,
    validate_run,
)
from mmm_core.model.validation import (
    CheckResult,
    check_decomposition_adds_up,
    check_interval_coverage,
    decomposition_residual,
    interval_coverage,
)

__all__ = [
    # configuration (resolved, what the sampler runs on)
    "AdstockType",
    "BaselinePriors",
    "ChannelConfig",
    "ChannelPriors",
    "ChannelType",
    "ChannelUnit",
    "KpiType",
    "LikelihoodType",
    "ModelConfig",
    "RoasCalibration",
    "SaturationType",
    "TrendType",
    "default_half_life",
    # measured dataset statistics
    "MIN_ACTIVE_WEEKS",
    "MIN_CHANNEL_CV",
    "ChannelStatistics",
    "DatasetStatistics",
    "is_effectively_constant",
    "measure_dataset",
    # intent (the closed vocabulary an AI or a user may speak)
    "Carryover",
    "ChannelIntent",
    "ChannelRole",
    "MediaShare",
    "ModelIntent",
    "SaturationBelief",
    "SeasonalityBelief",
    "Strength",
    # intent + statistics -> priors
    "ConfigIssue",
    "PriorProvenance",
    "ResolvedModel",
    "build_model_config",
    "burn_in_for",
    "likelihood_for",
    "required_burn_in",
    "widen_priors",
    # identifiability: can the data tell these channels apart?
    "ChannelIdentifiability",
    "IdentifiabilityReport",
    "assess_identifiability",
    "prior_effect_samples",
    "prior_sensitivity_shift",
    # the verdict, and what it allows
    "ModelValidation",
    "Output",
    "ValidationLevel",
    "validate_run",
    # ground truth + checks
    "ChannelDGP",
    "SimulatedDataset",
    "TrueChannel",
    "simulate_mmm",
    "CheckResult",
    "check_decomposition_adds_up",
    "check_interval_coverage",
    "decomposition_residual",
    "interval_coverage",
]
