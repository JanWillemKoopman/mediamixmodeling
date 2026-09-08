"""Model configuration: how a channel enters the model, and its prior expectations.

This is the *resolved* specification the sampler runs on. It is deliberately **not** the
surface an AI or a marketer touches directly: those express *intent* (see
:mod:`mmm_core.model.intent`) and :mod:`mmm_core.model.priors` translates that intent —
together with measured statistics of the actual dataset — into the numbers below. That
separation is the point: a prior is a statement about scale, and scale can only be derived
from the data, never guessed from a conversation.

The prior *defaults* on :class:`ChannelPriors` / :class:`BaselinePriors` exist so the
dataclasses are constructible in tests; they are placeholders, not recommendations.
:func:`mmm_core.model.priors.build_model_config` overwrites every one of them with a
value derived from the dataset, and records where each came from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ChannelType(str, Enum):
    """Coarse channel behaviour, used to pick sensible default adstock priors."""

    INTENT = "intent"   # captures existing demand (search, marketplaces) -> short carry-over
    BRAND = "brand"     # builds future demand (prospecting, video) -> long carry-over
    GENERIC = "generic" # unknown / mixed -> weakly-informative middle


class ChannelUnit(str, Enum):
    """What a channel's column actually measures.

    This is not cosmetic. Only ``currency`` channels have a ROAS ("KPI per euro") and
    only they can take part in budget optimisation — you cannot reallocate a euro into
    an impression. Mixing units into one "total weekly budget" and redistributing it, as
    the pre-refactor optimiser did, produces a number with no meaning. Non-currency
    channels are still modelled and still get a contribution; they are simply reported
    as "KPI per 1.000 units" and held fixed by the optimiser.
    """

    CURRENCY = "currency"        # euros/dollars spent
    IMPRESSIONS = "impressions"  # delivered impressions
    GRP = "grp"                  # gross rating points (TV/radio)
    SENDINGS = "sendings"        # e-mails/DMs sent
    CLICKS = "clicks"            # clicks delivered

    @property
    def is_monetary(self) -> bool:
        return self is ChannelUnit.CURRENCY


class KpiType(str, Enum):
    """What the target column counts.

    Drives the likelihood deterministically (see :func:`mmm_core.model.priors
    .likelihood_for`) instead of leaving that choice to an LLM: a Poisson on continuous
    revenue, or a Gaussian on 3-leads-a-week, are both silently wrong.
    """

    REVENUE = "revenue"    # continuous money
    ORDERS = "orders"      # integer counts, often small
    LEADS = "leads"        # integer counts, usually small
    SESSIONS = "sessions"  # integer counts, usually large


class AdstockType(str, Enum):
    """Which carry-over shape a channel uses."""

    GEOMETRIC = "geometric"  # peaks immediately, decays geometrically (digital default)
    DELAYED = "delayed"      # peaks `theta` weeks later then decays (TV/radio/OOH)


class SaturationType(str, Enum):
    """Which diminishing-returns shape a channel uses."""

    HILL = "hill"          # half-saturation + slope; can be S-shaped
    LOGISTIC = "logistic"  # single steepness lam; robust when data is thin


class LikelihoodType(str, Enum):
    """Observation noise model for the KPI.

    The first two are *additive* (linear link): the KPI is baseline + summed channel
    contributions. The count families use a *log link* (KPI = exp(baseline + effects)),
    which fits low-count integer KPIs (e.g. 5-50 leads/week) far better than a Gaussian -
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
    PIECEWISE = "piecewise"  # piecewise-linear with changepoints - captures drift/breaks


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
    """Prior hyper-parameters for one channel, in the model's scaled space.

    Every field here is *derived* by :mod:`mmm_core.model.priors` from the dataset; the
    defaults exist only so the dataclass is constructible. Do not treat them as sensible
    starting values — in particular ``beta_sigma`` must scale with the number of channels
    or the prior implies a KPI far above anything observed (see the module docstring of
    :mod:`mmm_core.model.priors`).

    Args:
        beta_sigma: HalfNormal scale on the channel effect (scaled-KPI units). This is the
            channel's slice of the model's total prior media budget.
        adstock_concentration: Concentration of the Beta prior on geometric retention
            ``alpha`` - higher pins the half-life closer to its expected value.
        delayed_peak_weeks: Prior centre for the peak lag ``theta`` (delayed adstock).
        delayed_peak_sigma: Prior scale for ``theta``.
        hill_slope_a, hill_slope_b: Gamma(a, b) prior on the Hill slope. The default is
            centred on 1.0 (concave from the origin); an S-curve has to be earned from the
            data, because an S-curve fitted on thin data is the classic source of absurd
            marginal-ROAS claims.
        halfsat_log_center: Median of the LogNormal prior on the Hill half-saturation, on
            *max-scaled* spend. Deliberately LogNormal and not Beta(0,1): a Beta cannot
            express "this channel is nowhere near saturated", because it caps the
            half-saturation point at the historical maximum spend. That cap silently
            biases every marginal ROAS downwards and makes the optimiser recommend
            flattening spend where scaling up would actually pay.
        halfsat_log_sigma: Log-scale spread of that LogNormal.
        logistic_lam_sigma: HalfNormal scale on the logistic steepness ``lam`` (scaled).
    """

    beta_sigma: float = 0.1
    adstock_concentration: float = 20.0
    delayed_peak_weeks: float = 2.0
    delayed_peak_sigma: float = 1.5
    hill_slope_a: float = 3.0
    hill_slope_b: float = 3.0
    halfsat_log_center: float = 0.5
    halfsat_log_sigma: float = 0.6
    logistic_lam_sigma: float = 2.0

    def __post_init__(self) -> None:
        if self.beta_sigma <= 0:
            raise ValueError("beta_sigma must be > 0")
        if self.adstock_concentration <= 0:
            raise ValueError("adstock_concentration must be > 0")
        if self.halfsat_log_center <= 0:
            raise ValueError("halfsat_log_center must be > 0")
        if self.halfsat_log_sigma <= 0:
            raise ValueError("halfsat_log_sigma must be > 0")
        if self.hill_slope_a <= 0 or self.hill_slope_b <= 0:
            raise ValueError("hill_slope_a/b must be > 0")
        if self.logistic_lam_sigma <= 0:
            raise ValueError("logistic_lam_sigma must be > 0")
        if self.delayed_peak_sigma <= 0:
            raise ValueError("delayed_peak_sigma must be > 0")


@dataclass(frozen=True)
class RoasCalibration:
    """An experimentally-measured ROAS to calibrate a channel against.

    This is the single strongest lever in the whole model: it enters the fit as a
    ``pm.Potential`` that pulls the channel's implied total ROAS toward ``roas``. It is
    therefore **never** derived from a conversation or inferred by a language model — it
    may only be set from a recorded experiment the user explicitly entered and confirmed
    (see the ``experiment`` gate in the worker's job-config parser).

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
        name: Column name of the channel's pressure (spend/impressions/...) in the master
            dataset.
        unit: What that column measures (see :class:`ChannelUnit`). Only ``currency``
            channels get a ROAS and take part in budget optimisation.
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
    unit: ChannelUnit = ChannelUnit.CURRENCY
    l_max: int = 12
    expected_half_life: float | None = None
    adstock: AdstockType = AdstockType.GEOMETRIC
    saturation: SaturationType = SaturationType.HILL
    priors: ChannelPriors = field(default_factory=ChannelPriors)
    calibration: RoasCalibration | None = None

    def __post_init__(self) -> None:
        # Both enums subclass `str`, so passing one where the other belongs is accepted
        # silently by Python and only surfaces much later as a nonsensical unit. Check the
        # exact types rather than trusting the call site.
        if not isinstance(self.channel_type, ChannelType):
            raise TypeError(
                f"channel {self.name!r}: channel_type must be a ChannelType, got "
                f"{self.channel_type!r}"
            )
        if not isinstance(self.unit, ChannelUnit):
            raise TypeError(
                f"channel {self.name!r}: unit must be a ChannelUnit, got {self.unit!r}"
            )
        if self.l_max < 1:
            raise ValueError(f"channel {self.name!r}: l_max must be >= 1")
        if self.expected_half_life is not None and self.expected_half_life <= 0:
            raise ValueError(f"channel {self.name!r}: expected_half_life must be > 0")
        if self.calibration is not None and not self.unit.is_monetary:
            raise ValueError(
                f"channel {self.name!r}: a ROAS calibration is only meaningful for a "
                f"currency channel, not for unit {self.unit.value!r}"
            )

    def half_life_prior_center(self) -> float:
        return self.expected_half_life or default_half_life(self.channel_type)


@dataclass(frozen=True)
class BaselinePriors:
    """Prior scales for the model's non-media (baseline) components, in scaled-KPI units.

    As with :class:`ChannelPriors`, every field is derived by
    :mod:`mmm_core.model.priors` from the dataset. ``season_sigma`` in particular *must*
    be measured rather than fixed: a constant seasonal prior that is too tight on a
    strongly seasonal business cannot absorb the December peak, and because media
    pressure peaks in December too, that peak lands on media instead. That is the single
    most common way an MMM over-credits advertising.

    Args:
        intercept_mu: Prior centre for the intercept - the KPI level expected *without*
            marketing. Together with the channels' ``beta_sigma`` this splits the KPI into
            a baseline share and a media share under the prior.
        intercept_sigma: Normal scale on the intercept.
        trend_sigma: Normal scale on the (base) trend slope.
        season_sigma: Normal scale on each Fourier seasonality coefficient.
        control_sigma: Normal scale on each control coefficient (standardized controls).
        noise_sigma: HalfNormal scale on the observation-noise sigma.
        changepoint_scale: Laplace scale on each piecewise-trend changepoint step. Smaller
            = a stiffer trend that resists bending; larger = more responsive to breaks.
    """

    intercept_mu: float | None = None   # None -> build.py falls back to the scaled median
    intercept_sigma: float = 0.25
    trend_sigma: float = 0.5
    season_sigma: float = 0.1
    control_sigma: float = 0.5
    noise_sigma: float = 0.1
    changepoint_scale: float = 0.1

    def __post_init__(self) -> None:
        for name in ("intercept_sigma", "trend_sigma", "control_sigma", "noise_sigma", "changepoint_scale"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be > 0")
        if self.season_sigma < 0:
            raise ValueError("season_sigma must be >= 0")


@dataclass(frozen=True)
class ModelConfig:
    """Full model specification over a master dataset.

    Args:
        kpi: Column name of the KPI (target) in the master dataset.
        kpi_type: What the KPI counts; fixes the likelihood family deterministically.
        channels: The media channels to attribute.
        control_columns: Exogenous controls (e.g. price) entered linearly.
        add_trend: Include a time trend as baseline component.
        trend_type: Shape of that trend (linear or piecewise/changepoint).
        n_changepoints: Number of changepoints for a piecewise trend (ignored otherwise).
        seasonality_periods: Seasonal cycle length in weeks (52 = yearly). ``None`` off.
        n_fourier_modes: Number of Fourier pairs for the seasonal term.
        likelihood: Observation noise model.
        student_t_nu: Degrees of freedom for the Student-T likelihood (lower = heavier
            tails / more outlier-robust). Ignored for other likelihoods.
        burn_in_weeks: Leading weeks excluded from the likelihood while still feeding the
            adstock convolution. The convolution zero-pads the start of the series, so the
            first weeks are missing the spend that happened *before* the window and their
            carry-over stock is systematically too low. Fitting on them biases every
            channel. These weeks still appear in the weekly decomposition, flagged.
        priors: Baseline-component prior scales (see :class:`BaselinePriors`).
    """

    kpi: str
    channels: tuple[ChannelConfig, ...]
    kpi_type: KpiType = KpiType.REVENUE
    control_columns: tuple[str, ...] = ()
    add_trend: bool = True
    trend_type: TrendType = TrendType.LINEAR
    n_changepoints: int = 6
    seasonality_periods: float | None = 52.0
    n_fourier_modes: int = 2
    likelihood: LikelihoodType = LikelihoodType.NORMAL
    student_t_nu: float = 4.0
    burn_in_weeks: int = 0
    priors: BaselinePriors = field(default_factory=BaselinePriors)

    def __post_init__(self) -> None:
        if not isinstance(self.kpi_type, KpiType):
            raise TypeError(f"kpi_type must be a KpiType, got {self.kpi_type!r}")
        if not isinstance(self.likelihood, LikelihoodType):
            raise TypeError(f"likelihood must be a LikelihoodType, got {self.likelihood!r}")
        if not self.channels:
            raise ValueError("model needs at least one channel")
        names = [c.name for c in self.channels]
        if len(names) != len(set(names)):
            raise ValueError("channel names must be unique")
        overlap = set(names) & set(self.control_columns)
        if overlap:
            raise ValueError(
                f"column(s) {sorted(overlap)} are used both as a media channel and as a "
                f"control; a column may only play one role"
            )
        if self.kpi in names or self.kpi in self.control_columns:
            raise ValueError(f"the KPI column {self.kpi!r} may not also be a channel or control")
        if self.likelihood is LikelihoodType.STUDENT_T and self.student_t_nu <= 2:
            raise ValueError("student_t_nu must be > 2 for a finite-variance likelihood")
        if self.trend_type is TrendType.PIECEWISE and self.n_changepoints < 1:
            raise ValueError("a piecewise trend needs at least one changepoint")
        if self.burn_in_weeks < 0:
            raise ValueError("burn_in_weeks must be >= 0")
        if self.likelihood.is_count and self.kpi_type is KpiType.REVENUE:
            raise ValueError(
                f"likelihood {self.likelihood.value!r} counts whole units, but kpi_type is "
                f"'revenue' (continuous money); set kpi_type to orders/leads/sessions, or "
                f"use a 'normal'/'student_t' likelihood"
            )

    @property
    def channel_names(self) -> list[str]:
        return [c.name for c in self.channels]

    @property
    def monetary_channel_names(self) -> list[str]:
        """Channels measured in money - the only ones a budget can be reallocated across."""
        return [c.name for c in self.channels if c.unit.is_monetary]
