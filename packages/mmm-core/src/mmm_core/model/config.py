"""Model configuration: how a channel enters the model, and its prior expectations.

This is exactly the surface Claude *parameterizes* per client — which channel is
intent-driven vs. brand-building, how long its carry-over is expected to last, which
carry-over/saturation shape to use, which likelihood fits the KPI, and how tight each
prior should be — without ever rewriting the model maths itself. Every default here
reproduces the original single-shape (geometric + Hill + Normal) model, so existing
configs keep fitting identically; the new fields only *widen* the toolbox.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ChannelType(str, Enum):
    """Coarse channel behaviour, used to pick sensible default adstock priors."""

    INTENT = "intent"   # captures existing demand (search, marketplaces) -> short carry-over
    BRAND = "brand"     # builds future demand (prospecting, video) -> long carry-over
    GENERIC = "generic" # unknown / mixed -> weakly-informative middle


class AdstockType(str, Enum):
    """Which carry-over shape a channel uses."""

    GEOMETRIC = "geometric"  # peaks immediately, decays geometrically (digital default)
    DELAYED = "delayed"      # peaks `theta` weeks later then decays (TV/radio/OOH)


class SaturationType(str, Enum):
    """Which diminishing-returns shape a channel uses."""

    HILL = "hill"          # kappa (half-saturation) + slope; can be S-shaped
    LOGISTIC = "logistic"  # single steepness lam; robust when data is thin


class LikelihoodType(str, Enum):
    """Observation noise model for the KPI.

    The first two are *additive* (linear link): the KPI is baseline + summed channel
    contributions. The count families use a *log link* (KPI = exp(baseline + effects)),
    which fits low-count integer KPIs (e.g. 5–50 leads/week) far better than a Gaussian —
    at the cost of a multiplicative decomposition, so attribution is done by counterfactual.
    """

    NORMAL = "normal"                      # symmetric Gaussian noise (default, additive)
    STUDENT_T = "student_t"                # heavy-tailed, additive: robust to outlier weeks
    POISSON = "poisson"                    # counts, log link: mean == variance
    NEGATIVE_BINOMIAL = "negative_binomial"  # counts, log link: overdispersed (var > mean)

    @property
    def is_count(self) -> bool:
        return self in (LikelihoodType.POISSON, LikelihoodType.NEGATIVE_BINOMIAL)


class TrendType(str, Enum):
    """Shape of the baseline time trend (only used when ``add_trend`` is on)."""

    LINEAR = "linear"        # one straight slope over the whole window (default)
    PIECEWISE = "piecewise"  # piecewise-linear with changepoints — captures drift/breaks


# Prior-centre for the adstock half-life (in weeks) per channel type. These *center* a
# weakly-informative prior; the data still moves them. Intent channels fade within a
# week or two; brand channels linger for over a month.
_DEFAULT_HALF_LIFE: dict[ChannelType, float] = {
    ChannelType.INTENT: 1.0,
    ChannelType.GENERIC: 2.5,
    ChannelType.BRAND: 5.0,
}


def default_half_life(channel_type: ChannelType) -> float:
    return _DEFAULT_HALF_LIFE[channel_type]


@dataclass(frozen=True)
class ChannelPriors:
    """Prior hyper-parameters for one channel. Defaults reproduce the original model.

    All are weakly-informative centres/scales the data can still move; expose them so
    the architect can tighten a prior when it has real knowledge (e.g. a channel whose
    effect is known to be small), or loosen it when the data should dominate.

    Args:
        beta_sigma: HalfNormal scale on the channel effect (scaled-KPI units). Smaller
            = a stronger "this channel does little" prior.
        adstock_concentration: Concentration of the Beta prior on geometric retention
            ``alpha`` — higher pins the half-life closer to its expected value.
        delayed_peak_weeks: Prior centre for the peak lag ``theta`` (delayed adstock).
        delayed_peak_sigma: Prior scale for ``theta``.
        hill_slope_a, hill_slope_b: Gamma(a, b) prior on the Hill slope.
        halfsat_a, halfsat_b: Beta(a, b) prior on the Hill half-saturation (scaled spend).
        logistic_lam_sigma: HalfNormal scale on the logistic steepness ``lam`` (scaled).
    """

    beta_sigma: float = 0.5
    adstock_concentration: float = 20.0
    delayed_peak_weeks: float = 2.0
    delayed_peak_sigma: float = 1.5
    hill_slope_a: float = 3.0
    hill_slope_b: float = 3.0
    halfsat_a: float = 2.0
    halfsat_b: float = 2.0
    logistic_lam_sigma: float = 2.0


@dataclass(frozen=True)
class RoasCalibration:
    """An experimentally-measured ROAS to calibrate a channel against.

    When a channel has a real incrementality result — a geo-experiment or lift test —
    fold it in here. It enters the fit as a *soft* prior on the channel's implied total
    ROAS (incremental KPI per unit spend), pulling the estimate toward the experiment
    while still letting strong data disagree. This is the calibration step that lifts MMM
    from "plausible" to "trustworthy enough to steer budget on".

    Args:
        roas: Measured incremental ROAS (KPI units returned per unit of spend).
        sd: Uncertainty (standard deviation) on that measurement. Smaller = trust the
            experiment more; larger = let the MMM data dominate.
    """

    roas: float
    sd: float

    def __post_init__(self) -> None:
        if self.roas < 0:
            raise ValueError("calibration roas must be >= 0")
        if self.sd <= 0:
            raise ValueError("calibration sd must be > 0")


@dataclass(frozen=True)
class ChannelConfig:
    """One media channel's configuration in the model.

    Args:
        name: Column name of the channel's spend in the master dataset.
        channel_type: Behaviour class, drives the default adstock prior.
        l_max: Maximum adstock carry-over lag in weeks.
        expected_half_life: Centre of the adstock half-life prior (weeks) for geometric
            adstock. Defaults to the per-type value; override with channel knowledge.
        adstock: Carry-over shape (geometric or delayed).
        saturation: Diminishing-returns shape (Hill or logistic).
        priors: Prior hyper-parameters (see :class:`ChannelPriors`).
        calibration: Optional experiment-based ROAS calibration (see
            :class:`RoasCalibration`).
    """

    name: str
    channel_type: ChannelType = ChannelType.GENERIC
    l_max: int = 12
    expected_half_life: float | None = None
    adstock: AdstockType = AdstockType.GEOMETRIC
    saturation: SaturationType = SaturationType.HILL
    priors: ChannelPriors = field(default_factory=ChannelPriors)
    calibration: RoasCalibration | None = None

    def half_life_prior_center(self) -> float:
        return self.expected_half_life or default_half_life(self.channel_type)


@dataclass(frozen=True)
class BaselinePriors:
    """Prior scales for the model's non-media (baseline) components.

    Defaults reproduce the original model. Widen a scale to let a component move more;
    tighten it to hold a component near zero.

    Args:
        intercept_sigma: Normal scale on the intercept (scaled-KPI units).
        trend_sigma: Normal scale on the (base) trend slope.
        season_sigma: Normal scale on each Fourier seasonality coefficient.
        control_sigma: Normal scale on each control coefficient (standardized controls).
        noise_sigma: HalfNormal scale on the observation-noise sigma.
        changepoint_scale: Laplace scale on each piecewise-trend changepoint step. Smaller
            = a stiffer trend that resists bending; larger = more responsive to breaks.
    """

    intercept_sigma: float = 0.25
    trend_sigma: float = 0.5
    season_sigma: float = 0.1
    control_sigma: float = 0.5
    noise_sigma: float = 0.1
    changepoint_scale: float = 0.1


@dataclass(frozen=True)
class ModelConfig:
    """Full model specification over a master dataset.

    Args:
        kpi: Column name of the KPI (target) in the master dataset.
        channels: The media channels to attribute.
        control_columns: Exogenous controls (e.g. price) entered linearly.
        add_trend: Include a time trend as baseline component.
        trend_type: Shape of that trend (linear or piecewise/changepoint).
        n_changepoints: Number of changepoints for a piecewise trend (ignored otherwise).
        seasonality_periods: Seasonal cycle length in weeks (52 = yearly). ``None`` off.
        n_fourier_modes: Number of Fourier pairs for the seasonal term.
        likelihood: Observation noise model (Normal or Student-T).
        student_t_nu: Degrees of freedom for the Student-T likelihood (lower = heavier
            tails / more outlier-robust). Ignored for the Normal likelihood.
        priors: Baseline-component prior scales (see :class:`BaselinePriors`).
    """

    kpi: str
    channels: tuple[ChannelConfig, ...]
    control_columns: tuple[str, ...] = ()
    add_trend: bool = True
    trend_type: TrendType = TrendType.LINEAR
    n_changepoints: int = 6
    seasonality_periods: float | None = 52.0
    n_fourier_modes: int = 2
    likelihood: LikelihoodType = LikelihoodType.NORMAL
    student_t_nu: float = 4.0
    priors: BaselinePriors = field(default_factory=BaselinePriors)

    def __post_init__(self) -> None:
        if not self.channels:
            raise ValueError("model needs at least one channel")
        names = [c.name for c in self.channels]
        if len(names) != len(set(names)):
            raise ValueError("channel names must be unique")
        if self.likelihood is LikelihoodType.STUDENT_T and self.student_t_nu <= 2:
            raise ValueError("student_t_nu must be > 2 for a finite-variance likelihood")
        if self.trend_type is TrendType.PIECEWISE and self.n_changepoints < 1:
            raise ValueError("a piecewise trend needs at least one changepoint")

    @property
    def channel_names(self) -> list[str]:
        return [c.name for c in self.channels]
