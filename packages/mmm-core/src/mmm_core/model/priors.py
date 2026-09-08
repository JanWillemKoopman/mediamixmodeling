"""Turn stated *intent* plus measured dataset statistics into a fitted model's priors.

This module is the fix for the single most consequential defect the audit found. The
pre-refactor model centred the intercept on the median KPI — as if marketing contributed
nothing — and then added, per channel, a strictly non-negative ``HalfNormal(0.5)`` effect
on top. Because those effects can only add, the prior-predictive KPI grew with every
channel added:

===============  ==================================  ======================
channels         prior mean KPI (observed max = 1)   P(prior > observed max)
===============  ==================================  ======================
1                0.81                                25%
3                1.23                                71%
5                1.65                                93%
8                2.28                                ~100%
===============  ==================================  ======================

A normal MMM has five to eight channels, so the model started from a prior that expected
roughly twice the KPI that was ever observed. The sampler resolves that contradiction by
pushing the intercept down — and since the intercept has its own tight prior, part of the
correction lands on the media coefficients instead. The result is a systematic
over-attribution to advertising in every contribution, every ROAS and every budget
recommendation the product ever produced.

The fix is a **prior media budget**. The user (or the AI, via the ordinal
:class:`~mmm_core.model.intent.MediaShare`) states what share of the KPI marketing plausibly
drives in total. The intercept is centred on the *remaining* share, and that media budget
is divided over the channels, so:

    E[intercept] + sum_c E[beta_c] * E[saturation_c] == median KPI

holds by construction, for one channel or for twelve. Adding a channel splits the existing
budget instead of inflating the total.

Two further scale fixes live here for the same reason — a prior is a statement about
scale, and scale has to be measured:

* **Saturation.** The half-saturation point is a LogNormal centred on the channel's own
  *median* weekly pressure, not a ``Beta(2,2)`` on max-scaled spend. The old Beta could not
  put the half-saturation point above the historical maximum at all (median 0.5x max,
  P(>0.9x max) = 2.8%), so the model was structurally incapable of saying "this channel is
  nowhere near saturated" — which biases every marginal ROAS down and makes the optimiser
  recommend flattening spend where scaling up would pay.
* **Seasonality.** ``season_sigma`` is derived from the seasonal amplitude actually present
  in the KPI, not fixed at 0.1. On a retailer with a 3-5x December peak a fixed prior is
  far too tight to absorb that peak — and since media pressure peaks in December too, the
  peak lands on media.

Everything here is deterministic: same intent + same dataset = same priors, forever. Each
derived number carries a :class:`PriorProvenance` explaining, in the user's own terms,
where it came from.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

import numpy as np

from mmm_core.model.config import (
    AdstockType,
    BaselinePriors,
    ChannelConfig,
    ChannelPriors,
    ChannelType,
    KpiType,
    LikelihoodType,
    ModelConfig,
    SaturationType,
    TrendType,
)
from mmm_core.model.datastats import ChannelStatistics, DatasetStatistics
from mmm_core.model.intent import (
    Carryover,
    ChannelIntent,
    ChannelRole,
    ModelIntent,
    SaturationBelief,
    SeasonalityBelief,
    adstock_concentration_for,
    half_life_for,
    media_share_center,
    saturation_center_for,
    saturation_sigma_for,
    season_multiplier_for,
    strength_weight_for,
)

# E[|X|] for X ~ Normal(0, s) is s * sqrt(2/pi); the mean of a HalfNormal(s).
_HALFNORMAL_MEAN_FACTOR = math.sqrt(2.0 / math.pi)

# A yearly seasonal cycle cannot be estimated from less than a year of data, and is barely
# identified below eighteen months. Below these thresholds we reduce or drop it rather than
# pretend, because a badly identified seasonal term is exactly what steals media effect.
MIN_WEEKS_FOR_SEASONALITY = 60
MIN_WEEKS_FOR_TWO_FOURIER_MODES = 90

# Excess kurtosis above this means the KPI has genuinely heavy tails and a Student-T
# likelihood is the honest choice rather than an outlier-chasing Normal.
STUDENT_T_KURTOSIS_THRESHOLD = 1.5

# A count KPI this small per week is far better served by a count likelihood than by a
# Gaussian, which happily predicts negative leads.
COUNT_LIKELIHOOD_MEDIAN_THRESHOLD = 50.0

# Fraction of the adstock weight mass that must have accumulated before a week is trusted
# in the likelihood. Below it the week is missing pre-window spend and its carry-over
# stock is systematically too low.
BURN_IN_WEIGHT_COVERAGE = 0.95
# Never spend more than this share of the window on burn-in; on a short dataset the bias
# is the lesser evil compared to throwing away a third of the observations.
MAX_BURN_IN_FRACTION = 0.2

# Rule of thumb: an MMM needs roughly this many weeks per channel before the channels can
# be told apart at all. Mirrors _WPC_ERROR in the ingestion pipeline.
MIN_WEEKS_PER_CHANNEL = 4.0


@dataclass(frozen=True)
class PriorProvenance:
    """Where one derived prior number came from, in terms a user can check."""

    parameter: str
    value: float
    derived_from: str


@dataclass(frozen=True)
class ConfigIssue:
    """A problem found while resolving intent into a runnable configuration.

    ``severity`` follows the ingestion convention: ``error`` blocks, ``warning`` is worth
    reading, ``info`` is transparency about something that was decided automatically.
    Messages are Dutch and user-facing; the caller never has to translate them.
    """

    code: str
    severity: str
    message: str
    column: str | None = None


@dataclass(frozen=True)
class ResolvedModel:
    """The outcome of resolving a :class:`ModelIntent` against a dataset."""

    config: ModelConfig | None
    provenance: tuple[PriorProvenance, ...]
    issues: tuple[ConfigIssue, ...]

    @property
    def errors(self) -> list[ConfigIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[ConfigIssue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def has_errors(self) -> bool:
        return bool(self.errors)


# --- likelihood ------------------------------------------------------------------

def likelihood_for(kpi_type: KpiType, stats: DatasetStatistics) -> tuple[LikelihoodType, str]:
    """Pick the observation model from what the KPI actually is.

    Deliberately not an AI decision: a Poisson on continuous revenue and a Gaussian on
    three-leads-a-week are both silently wrong, and neither shows up as a convergence
    failure. Returns the likelihood plus a Dutch explanation.
    """
    if kpi_type in (KpiType.ORDERS, KpiType.LEADS):
        if stats.kpi_is_integer and stats.kpi_median_raw <= COUNT_LIKELIHOOD_MEDIAN_THRESHOLD:
            return (
                LikelihoodType.NEGATIVE_BINOMIAL,
                f"de KPI telt hele eenheden en ligt rond {stats.kpi_median_raw:.0f} per week; "
                f"bij zulke lage aantallen past een tellingsmodel beter dan een normaal "
                f"model (dat zou ook negatieve aantallen kunnen voorspellen)",
            )
        return (
            LikelihoodType.NORMAL,
            f"de KPI telt eenheden maar ligt rond {stats.kpi_median_raw:.0f} per week — hoog "
            f"genoeg om als continue waarde te behandelen",
        )
    if stats.residual_excess_kurtosis > STUDENT_T_KURTOSIS_THRESHOLD:
        return (
            LikelihoodType.STUDENT_T,
            f"de KPI heeft af en toe extreme weken (piekmaat "
            f"{stats.residual_excess_kurtosis:.1f}); een robuust model laat die weken de "
            f"schatting niet domineren",
        )
    return (LikelihoodType.NORMAL, "de KPI is continu en heeft geen extreme uitschieters")


# --- adstock burn-in -------------------------------------------------------------

def _normalized_geometric_weights(alpha: float, l_max: int) -> np.ndarray:
    w = alpha ** np.arange(l_max, dtype=float)
    return w / w.sum()


def _normalized_delayed_weights(alpha: float, theta: float, l_max: int) -> np.ndarray:
    lags = np.arange(l_max, dtype=float)
    w = alpha ** ((lags - theta) ** 2)
    return w / w.sum()


def required_burn_in(channel: ChannelConfig) -> int:
    """Leading weeks whose adstock stock is materially incomplete for this channel.

    The convolution zero-pads the start of the series, so week 0 sees only its own spend
    and none of the spend that happened before the upload window began. How many weeks
    that matters for depends on the carry-over, not on ``l_max``: a channel with a
    half-week half-life is fine after two weeks even if ``l_max`` is 12.

    Returns the first lag at which the (normalised) weight mass reaches
    :data:`BURN_IN_WEIGHT_COVERAGE`.
    """
    from mmm_core.transforms import alpha_from_half_life

    alpha = alpha_from_half_life(channel.half_life_prior_center())
    alpha = min(max(alpha, 1e-6), 1.0 - 1e-9)
    if channel.adstock is AdstockType.DELAYED:
        weights = _normalized_delayed_weights(alpha, channel.priors.delayed_peak_weeks, channel.l_max)
    else:
        weights = _normalized_geometric_weights(alpha, channel.l_max)
    cumulative = np.cumsum(weights)
    reached = np.argmax(cumulative >= BURN_IN_WEIGHT_COVERAGE)
    return int(reached)


def burn_in_for(channels: tuple[ChannelConfig, ...], n_weeks: int) -> int:
    """Burn-in for the whole model: the slowest channel decides, capped at 20% of the window."""
    needed = max((required_burn_in(c) for c in channels), default=0)
    return int(min(needed, int(n_weeks * MAX_BURN_IN_FRACTION)))


# --- the builder -----------------------------------------------------------------

def _adstock_and_type(role: ChannelRole) -> tuple[AdstockType, ChannelType]:
    if role is ChannelRole.BRAND_BUILDING:
        return AdstockType.DELAYED, ChannelType.BRAND
    if role is ChannelRole.DEMAND_CAPTURE:
        return AdstockType.GEOMETRIC, ChannelType.INTENT
    return AdstockType.GEOMETRIC, ChannelType.GENERIC


def _saturation_shape(cs: ChannelStatistics, n_weeks: int) -> SaturationType:
    """Hill when there is enough data to identify its two parameters; logistic otherwise.

    Hill has a shape parameter on top of the half-saturation point. On thin data that
    extra freedom is what produces implausible S-curves and, through them, absurd
    marginal-ROAS claims — so a single-parameter logistic is the safer shape there.
    """
    if n_weeks < 52 or cs.n_active_weeks < 20:
        return SaturationType.LOGISTIC
    return SaturationType.HILL


def _expected_saturation_at_typical_spend(center_multiplier: float) -> float:
    """E[saturation] at the channel's typical weekly pressure, under its own prior.

    With the half-saturation point centred at ``center_multiplier`` x the median weekly
    pressure and a slope prior centred on 1, the Hill curve evaluated *at* that median is
    ``1 / (1 + center_multiplier)``. Having this in closed form is what lets the media
    budget below balance exactly instead of being calibrated by simulation.
    """
    return 1.0 / (1.0 + center_multiplier)


def _channel_priors(
    ci: ChannelIntent,
    cs: ChannelStatistics,
    *,
    beta_sigma: float,
    saturation: SaturationType,
) -> tuple[ChannelPriors, list[PriorProvenance]]:
    mult = saturation_center_for(ci.saturation)
    # The half-saturation prior lives on max-scaled spend, so express the channel's median
    # weekly pressure on that same axis and shift it by the saturation belief.
    center = max(cs.median_scaled * mult, 1e-4)
    prov = [
        PriorProvenance(
            f"beta_{ci.name}",
            beta_sigma,
            f"aandeel van het verwachte marketing-effect voor {ci.name} "
            f"(verwachte kracht: {ci.strength.value})",
        ),
        PriorProvenance(
            f"halfsat_{ci.name}",
            center,
            f"verzadigingspunt gecentreerd op {mult:g}x de mediane weekdruk van {ci.name} "
            f"(verwachting: {ci.saturation.value})",
        ),
        PriorProvenance(
            f"alpha_{ci.name}",
            half_life_for(ci.carryover),
            f"halfwaardetijd van {half_life_for(ci.carryover):g} weken (na-ijl: "
            f"{ci.carryover.value})",
        ),
    ]
    priors = ChannelPriors(
        beta_sigma=beta_sigma,
        adstock_concentration=adstock_concentration_for(ci.carryover),
        delayed_peak_weeks=2.0 if ci.role is ChannelRole.BRAND_BUILDING else 1.0,
        delayed_peak_sigma=1.5,
        hill_slope_a=3.0,
        hill_slope_b=3.0,
        halfsat_log_center=center,
        halfsat_log_sigma=saturation_sigma_for(ci.saturation),
        # ln(3)/lam is the logistic half-point, so centring lam on ln(3)/center puts the
        # logistic's half-saturation in the same place as the Hill's would be.
        logistic_lam_sigma=max(math.log(3.0) / center, 1e-3),
    )
    return priors, prov


def build_model_config(intent: ModelIntent, stats: DatasetStatistics) -> ResolvedModel:
    """Resolve stated intent against a measured dataset into a runnable :class:`ModelConfig`.

    Returns a :class:`ResolvedModel`; when it carries errors, ``config`` is ``None`` and the
    caller must show the errors rather than fit anything.
    """
    issues: list[ConfigIssue] = []
    provenance: list[PriorProvenance] = []

    # --- blocking checks on the data itself -------------------------------------
    known = {c.name for c in stats.channels}
    for ci in intent.channels:
        if ci.name not in known:
            issues.append(
                ConfigIssue(
                    "unknown_channel", "error",
                    f"kanaal {ci.name!r} komt niet voor in de dataset",
                    column=ci.name,
                )
            )
    if any(i.severity == "error" for i in issues):
        return ResolvedModel(None, tuple(provenance), tuple(issues))

    for ci in intent.channels:
        cs = stats.channel(ci.name)
        reason = cs.degenerate_reason()
        if reason is not None:
            issues.append(
                ConfigIssue(
                    "channel_not_estimable", "error",
                    f"kanaal {ci.name!r} kan niet betrouwbaar geschat worden: {reason}. "
                    f"Haal dit kanaal uit het model of voeg het samen met een vergelijkbaar "
                    f"kanaal — anders komt het cijfer dat je ziet volledig uit de aanname, "
                    f"niet uit je data.",
                    column=ci.name,
                )
            )

    n_channels = len(intent.channels)
    weeks_per_channel = stats.n_weeks / n_channels
    if weeks_per_channel < MIN_WEEKS_PER_CHANNEL:
        issues.append(
            ConfigIssue(
                "too_many_channels", "error",
                f"{n_channels} kanalen op {stats.n_weeks} weken ({weeks_per_channel:.1f} "
                f"weken per kanaal) — te weinig data om de kanalen uit elkaar te houden. "
                f"Voeg kanalen samen of gebruik een langere periode.",
            )
        )
    elif weeks_per_channel < 8:
        issues.append(
            ConfigIssue(
                "few_weeks_per_channel", "warning",
                f"{n_channels} kanalen op {stats.n_weeks} weken ({weeks_per_channel:.1f} "
                f"weken per kanaal) — reken op brede onzekerheidsmarges per kanaal.",
            )
        )

    for ctrl in intent.control_columns:
        if stats.control_std.get(ctrl, 0.0) <= 0:
            issues.append(
                ConfigIssue(
                    "constant_control", "error",
                    f"controlevariabele {ctrl!r} is constant over de hele periode en kan "
                    f"dus niets verklaren; haal 'm uit het model.",
                    column=ctrl,
                )
            )

    if any(i.severity == "error" for i in issues):
        return ResolvedModel(None, tuple(provenance), tuple(issues))

    # --- likelihood --------------------------------------------------------------
    likelihood, likelihood_why = likelihood_for(intent.kpi_type, stats)
    issues.append(ConfigIssue("likelihood_chosen", "info", f"Ruismodel: {likelihood_why}."))
    if likelihood.is_count and stats.n_zero_kpi_weeks:
        issues.append(
            ConfigIssue(
                "kpi_zero_weeks", "info",
                f"{stats.n_zero_kpi_weeks} week/weken met een KPI van 0 — een tellingsmodel "
                f"gaat daar prima mee om.",
            )
        )

    # --- seasonality --------------------------------------------------------------
    seasonality_periods: float | None = 52.0
    n_fourier_modes = 2
    if intent.seasonality is SeasonalityBelief.NONE:
        seasonality_periods = None
        issues.append(
            ConfigIssue("seasonality_off", "info", "Seizoen staat uit op jouw aangeven.")
        )
    elif stats.n_weeks < MIN_WEEKS_FOR_SEASONALITY:
        seasonality_periods = None
        issues.append(
            ConfigIssue(
                "seasonality_unidentifiable", "warning",
                f"Met {stats.n_weeks} weken is een jaarpatroon niet betrouwbaar te schatten "
                f"(daar is minstens {MIN_WEEKS_FOR_SEASONALITY} weken voor nodig), dus het "
                f"seizoen zit niet in het model. Let op: als je KPI wél een jaarritme heeft, "
                f"kan dat deels bij de marketingkanalen terechtkomen.",
            )
        )
    elif stats.n_weeks < MIN_WEEKS_FOR_TWO_FOURIER_MODES:
        n_fourier_modes = 1
        issues.append(
            ConfigIssue(
                "seasonality_simplified", "info",
                f"Met {stats.n_weeks} weken houden we het seizoenspatroon eenvoudig (één "
                f"golf per jaar in plaats van twee).",
            )
        )

    # --- trend --------------------------------------------------------------------
    add_trend = intent.expect_trend
    trend_type = TrendType.PIECEWISE if intent.expect_structural_break else TrendType.LINEAR

    # --- the media budget: the heart of this module ------------------------------
    media_share = media_share_center(intent.media_share_belief)
    baseline_level = (1.0 - media_share) * stats.kpi_median_scaled
    provenance.append(
        PriorProvenance(
            "intercept_mu", baseline_level,
            f"basislijn = {(1 - media_share):.0%} van de mediane KPI, omdat je verwacht dat "
            f"marketing ongeveer {media_share:.0%} van de KPI drijft",
        )
    )

    raw_weights = np.array([strength_weight_for(ci.strength) for ci in intent.channels], dtype=float)
    weights = raw_weights / raw_weights.sum()

    channels: list[ChannelConfig] = []
    for ci, w in zip(intent.channels, weights):
        cs = stats.channel(ci.name)
        saturation = _saturation_shape(cs, stats.n_weeks)
        adstock, channel_type = _adstock_and_type(ci.role)
        expected_sat = _expected_saturation_at_typical_spend(saturation_center_for(ci.saturation))
        # Solve E[beta] * E[saturation] == this channel's slice of the media budget, with
        # E[beta] = beta_sigma * sqrt(2/pi) for a HalfNormal.
        #
        # The two links need different targets because beta lives in a different space in
        # each. Additive: contributions sum in scaled-KPI units, so the slice is a fraction
        # of the median KPI. Count (log link): the KPI is exp(baseline + sum of effects),
        # so a channel responsible for share `s` of the total contributes -log(1 - s) in
        # log space. Using the additive target under a log link would scale every media
        # effect by the median KPI and blow the prior up by orders of magnitude.
        slice_share = float(w) * media_share
        if likelihood.is_count:
            target_contribution = -math.log(max(1.0 - slice_share, 1e-6))
        else:
            target_contribution = slice_share * stats.kpi_median_scaled
        beta_sigma = max(
            target_contribution / (_HALFNORMAL_MEAN_FACTOR * expected_sat), 1e-6
        )
        priors, prov = _channel_priors(ci, cs, beta_sigma=beta_sigma, saturation=saturation)
        provenance.extend(prov)

        l_max = min(12, max(4, stats.n_weeks // 4))
        if l_max < 12:
            issues.append(
                ConfigIssue(
                    "l_max_capped", "info",
                    f"Na-ijl voor {ci.name} loopt maximaal {l_max} weken door (beperkt door "
                    f"de lengte van je dataset).",
                    column=ci.name,
                )
            )
        channels.append(
            ChannelConfig(
                name=ci.name,
                unit=ci.unit,
                channel_type=channel_type,
                l_max=l_max,
                expected_half_life=half_life_for(ci.carryover),
                adstock=adstock,
                saturation=saturation,
                priors=priors,
            )
        )

    channel_tuple = tuple(channels)
    burn_in = burn_in_for(channel_tuple, stats.n_weeks)
    if burn_in:
        issues.append(
            ConfigIssue(
                "burn_in_applied", "info",
                f"De eerste {burn_in} week/weken bouwen alleen de na-ijl op en tellen niet "
                f"mee in de schatting: hun doorwerking van eerdere uitgaven ontbreekt, dus "
                f"meetellen zou het effect van alle kanalen vertekenen.",
            )
        )

    # --- baseline priors, all measured -------------------------------------------
    intercept_sigma = max(0.05, 0.5 * media_share * stats.kpi_median_scaled)
    trend_sigma = max(0.05, 3.0 * abs(stats.trend_slope_scaled))
    if seasonality_periods is None:
        season_sigma = 0.0
    else:
        season_sigma = max(
            0.01,
            season_multiplier_for(intent.seasonality) * stats.seasonal_amplitude_scaled,
        )
    control_sigma = max(0.05, 1.5 * stats.kpi_std_scaled)
    noise_sigma = max(0.005, 2.0 * stats.residual_sd_scaled)

    provenance.extend(
        [
            PriorProvenance("intercept_sigma", intercept_sigma, "onzekerheid op de basislijn"),
            PriorProvenance(
                "trend_sigma", trend_sigma,
                f"gemeten trend over de periode ({stats.trend_slope_scaled:+.3f} van de "
                f"maximale KPI), met ruimte eromheen",
            ),
            PriorProvenance(
                "season_sigma", season_sigma,
                f"gemeten seizoensuitslag in je KPI ({stats.seasonal_amplitude_scaled:.3f}) "
                f"x jouw verwachting ({intent.seasonality.value})"
                if seasonality_periods is not None
                else "seizoen staat uit",
            ),
            PriorProvenance(
                "noise_sigma", noise_sigma,
                f"gemeten ruis die overblijft na trend, seizoen en kanalen "
                f"({stats.residual_sd_scaled:.4f})",
            ),
        ]
    )

    baseline = BaselinePriors(
        intercept_mu=baseline_level,
        intercept_sigma=intercept_sigma,
        trend_sigma=trend_sigma,
        season_sigma=season_sigma if seasonality_periods is not None else 0.1,
        control_sigma=control_sigma,
        noise_sigma=noise_sigma,
        changepoint_scale=max(0.01, 0.3 * trend_sigma),
    )

    config = ModelConfig(
        kpi=intent.kpi,
        kpi_type=intent.kpi_type,
        channels=channel_tuple,
        control_columns=tuple(intent.control_columns),
        add_trend=add_trend,
        trend_type=trend_type,
        n_changepoints=min(6, max(1, stats.n_weeks // 20)),
        seasonality_periods=seasonality_periods,
        n_fourier_modes=n_fourier_modes,
        likelihood=likelihood,
        student_t_nu=4.0,
        burn_in_weeks=burn_in,
        priors=baseline,
    )
    return ResolvedModel(config, tuple(provenance), tuple(issues))


def widen_priors(config: ModelConfig, factor: float = 2.0) -> ModelConfig:
    """Return the same configuration with every prior scale multiplied by ``factor``.

    Used for the prior-sensitivity check: fit once normally, once with everything twice as
    loose, and compare. A channel whose contribution moves a lot between the two was being
    held in place by the prior rather than by the data — which is exactly what a user
    deserves to be told before they move budget on it.
    """
    if factor <= 0:
        raise ValueError("factor must be > 0")
    channels = tuple(
        replace(
            c,
            priors=replace(
                c.priors,
                beta_sigma=c.priors.beta_sigma * factor,
                adstock_concentration=max(c.priors.adstock_concentration / factor, 2.0),
                halfsat_log_sigma=c.priors.halfsat_log_sigma * factor,
                logistic_lam_sigma=c.priors.logistic_lam_sigma * factor,
            ),
        )
        for c in config.channels
    )
    p = config.priors
    return replace(
        config,
        channels=channels,
        priors=replace(
            p,
            intercept_sigma=p.intercept_sigma * factor,
            trend_sigma=p.trend_sigma * factor,
            season_sigma=p.season_sigma * factor,
            control_sigma=p.control_sigma * factor,
            noise_sigma=p.noise_sigma * factor,
            changepoint_scale=p.changepoint_scale * factor,
        ),
    )
