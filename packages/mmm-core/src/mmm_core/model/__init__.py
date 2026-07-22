"""The Bayesian MMM model, its configuration, ground-truth simulator and checks.

Importing this package is cheap: the heavy PyMC/numpyro/ArviZ stack is only imported
inside :func:`mmm_core.model.build.build_model` / :func:`mmm_core.model.fit.fit_model`,
so config, simulation and validation stay usable without the model extra installed.
"""

from mmm_core.model.config import (
    AdstockType,
    BaselinePriors,
    ChannelConfig,
    ChannelPriors,
    ChannelType,
    LikelihoodType,
    ModelConfig,
    RoasCalibration,
    SaturationType,
    TrendType,
    default_half_life,
)
from mmm_core.model.simulate import (
    ChannelDGP,
    SimulatedDataset,
    TrueChannel,
    simulate_mmm,
)
from mmm_core.model.validation import (
    CheckResult,
    check_decomposition_adds_up,
    check_interval_coverage,
    decomposition_residual,
    interval_coverage,
)

__all__ = [
    "AdstockType",
    "BaselinePriors",
    "ChannelConfig",
    "ChannelPriors",
    "ChannelType",
    "LikelihoodType",
    "ModelConfig",
    "RoasCalibration",
    "SaturationType",
    "TrendType",
    "default_half_life",
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
