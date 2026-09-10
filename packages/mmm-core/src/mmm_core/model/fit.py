"""Fit the MMM and summarize it into the JSON the client dashboard reads.

This is the boundary the architecture cares about: the heavy ArviZ ``InferenceData``
(raw posterior) is meant for Storage as a compressed ``.nc``; the *summary* produced
here — contribution shares, cost-per-unit, adstock half-life and saturation point, each
with a credible interval, plus convergence diagnostics — is the small JSON that goes to
Postgres for fast dashboard rendering.

Uncertainty is never optional: every channel figure is reported as (p3, p50, p97).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field, replace

import numpy as np
import pandas as pd

from mmm_core.model.build import BuiltModel, build_model
from mmm_core.model.config import (
    AdstockType,
    ChannelConfig,
    LikelihoodType,
    ModelConfig,
    SaturationType,
)
from mmm_core.model.identify import (
    ChannelIdentifiability,
    IdentifiabilityReport,
    assess_identifiability,
    prior_effect_samples,
)
from mmm_core.model.validate import ModelValidation, Output, validate_run
from mmm_core.model.validation import check_decomposition_adds_up, interval_coverage
from mmm_core.transforms import half_life_from_alpha

# Credible-interval percentiles reported for every quantity.
_P_LOW, _P_MID, _P_HIGH = 3.0, 50.0, 97.0


@dataclass
class Interval:
    """A point estimate with a credible interval."""

    p3: float
    p50: float
    p97: float

    @staticmethod
    def from_samples(samples: np.ndarray) -> "Interval":
        lo, mid, hi = np.percentile(samples, [_P_LOW, _P_MID, _P_HIGH])
        return Interval(float(lo), float(mid), float(hi))


@dataclass
class ChannelResult:
    name: str
    absolute_contribution: Interval   # KPI units attributed to the channel (summed)
    contribution_share: Interval      # fraction of total KPI
    # Return per unit of pressure. `None` when the channel had no pressure at all in the
    # observed window, because "KPI per zero euros" is not a number — the pre-refactor code
    # produced NaN here, which then broke the entire result insert.
    roas: Interval | None
    adstock_half_life_weeks: Interval
    saturation_point: Interval        # weekly pressure at half-saturation, original units
    total_spend: float
    # What `total_spend`, `roas` and `saturation_point` are denominated in. Only a
    # `currency` channel has a ROAS in the everyday sense; for the others this is "KPI per
    # unit of pressure" and it must never be summed with, or traded off against, euros.
    unit: str = "currency"
    # Direct/carry-over split: the share of this channel's contribution driven by the
    # SAME week's spend (direct: "saw the ad, bought that week") vs earlier weeks'
    # spend still working through adstock (carry-over: "saw the ad, bought later").
    # Each week's contribution is allocated by the composition of the adstocked spend
    # stock — a proportional allocation, since saturation is applied after adstock.
    # Optional so summaries from older fits (without the split) keep deserializing.
    direct_contribution: Interval | None = None
    carryover_contribution: Interval | None = None
    direct_share: Interval | None = None


@dataclass
class WeeklyDecomposition:
    """Compact per-week decomposition for the dashboard's build-up and fit-vs-actual
    charts: the actual KPI, the model's expectation (median + 94% predictive band) and
    the median baseline / per-channel contributions. Medians only for the components —
    the stacked chart needs one number per layer per week, and this keeps the summary
    JSON small (~(4 + n_channels) × n_weeks floats)."""

    dates: list[str]
    actual: list[float]
    expected_p50: list[float]
    expected_p3: list[float]
    expected_p97: list[float]
    baseline_p50: list[float]
    channels_p50: dict[str, list[float]]
    # Per-week spend per channel (original units, fixed data — not a posterior quantity).
    # Feeds the dashboard's ROAS-over-time chart (weekly contribution ÷ weekly spend).
    # Optional so summaries predating it keep deserializing.
    channel_spend: dict[str, list[float]] = field(default_factory=dict)
    # Leading weeks that only built up the adstock and were NOT part of the likelihood.
    # The chart still draws them (the build-up is real) but the reader has to know the
    # model was not scored on them.
    burn_in_weeks: int = 0


@dataclass
class BaselineDecomposition:
    """Splits the otherwise black-box baseline into its parts over time, in KPI units
    (median per week): the structural level (intercept), the slow trend, the seasonal
    swing and the external factors (control columns). Only the components that the model
    actually has are present. For the additive link these add up to ``baseline_p50``
    exactly; for the count (log) link they are allocated the same Shapley-style way as the
    channel contributions, so they still sum to the baseline. Optional on the summary so
    older fits keep deserializing."""

    dates: list[str]
    components: dict[str, list[float]]   # keyed: niveau / trend / seizoen / externe_factoren
    control_names: list[str]             # which columns make up "externe_factoren"


@dataclass
class Diagnostics:
    """Everything measured about the fit — the numbers, not the verdict.

    Deliberately separate from the judgement (:mod:`mmm_core.model.validate`): a threshold
    can be tightened later without silently re-scoring runs that were already published,
    because the measurements they were scored on are still here unchanged.
    """

    # --- did the sampler work? -------------------------------------------------
    max_r_hat: float
    min_ess_bulk: float
    # Tail ESS matters separately from bulk: the credible *interval* is a statement about
    # the tails, and a posterior can have plenty of bulk samples while its 3rd/97th
    # percentiles are still estimated from a handful of effective draws.
    min_ess_tail: float
    n_divergences: int
    # Energy-BFMI below ~0.3 means the sampler could not explore the posterior's energy
    # distribution — a warning that survives even when R-hat looks perfect.
    min_e_bfmi: float
    # Draws that hit the sampler's tree-depth ceiling: not wrong, but the geometry is hard
    # and the exploration was cut short.
    n_max_treedepth: int

    # --- does the model describe the data? -------------------------------------
    r2: float
    mape: float
    interval_coverage_94: float       # share of weeks whose actual KPI falls in the 94% PI
    # Coverage at several levels, not just one: a model can hit 94% by having one enormous
    # interval while its 50% interval covers almost nothing.
    interval_coverage_80: float
    interval_coverage_50: float
    # Lag-1 autocorrelation of the residuals. On a time series this is the signal that
    # structure is missing — the model is systematically late or early — and it is invisible
    # to R-squared.
    residual_autocorrelation: float
    decomposition_ok: bool


@dataclass
class CurvePoint:
    weekly_spend: float
    contribution: Interval            # steady-state KPI contribution at this spend
    extrapolated: bool                # beyond the historically-tested max spend


@dataclass
class ResponseCurve:
    name: str
    current_weekly_spend: float       # average weekly spend over the window
    marginal_roas_at_current: Interval  # return on the next euro at current spend
    points: list[CurvePoint]


@dataclass
class OptimalAllocation:
    """Best split of the *current* total weekly budget across monetary channels.

    Only channels measured in money take part: a euro cannot be moved into an impression
    or an e-mail sending, so those channels are held at their current level and named in
    ``fixed_channels`` rather than silently folded into a meaningless "total budget".
    """

    total_weekly_budget: float
    per_channel: dict[str, float]
    predicted_contribution: Interval
    capped_channels: list[str]
    # Channels excluded from the reallocation because their pressure is not money.
    fixed_channels: list[str] = field(default_factory=list)


@dataclass
class FrontierPoint:
    total_weekly_budget: float
    predicted_contribution: Interval   # marketing KPI at the optimal split of this budget


@dataclass
class FitSummary:
    kpi: str
    # What the KPI counts. Carried on the summary so the interface can word the results
    # correctly ("per verkochte eenheid" vs "per euro omzet") without having to fetch the
    # configuration separately and risk getting a different one.
    kpi_type: str
    n_weeks: int
    window: tuple[str, str]
    baseline_contribution: Interval   # KPI explained without marketing
    channels: list[ChannelResult]
    diagnostics: Diagnostics
    draws: int
    chains: int
    # The judgement on this fit, and the gate on what may be shown from it. `None` only
    # for a summary built by hand in a test.
    validation: ModelValidation | None = None
    # Why each channel is (or is not) reported individually. Kept next to the results so
    # a reader can see the reason without leaving the page.
    identifiability: list[ChannelIdentifiability] = field(default_factory=list)
    response_curves: list[ResponseCurve] = field(default_factory=list)
    optimal_allocation: OptimalAllocation | None = None
    efficiency_frontier: list[FrontierPoint] = field(default_factory=list)
    # Optional so summaries from fits predating the weekly block keep deserializing.
    weekly: WeeklyDecomposition | None = None
    # Optional per-week breakdown of the baseline into level/trend/season/controls.
    baseline_decomposition: BaselineDecomposition | None = None

    def to_json_dict(self) -> dict:
        """A plain, JSON-serializable dict (what the worker writes to Postgres)."""
        payload = _to_plain(asdict(self))
        # ModelValidation has its own serialisation (enums, frozensets); asdict would turn
        # the level into an Enum object and the allowed outputs into nothing useful.
        payload["validation"] = self.validation.to_json_dict() if self.validation else None
        return payload

    @property
    def level(self):
        from mmm_core.model.validate import ValidationLevel

        return self.validation.level if self.validation else ValidationLevel.NOT_USABLE


def _to_plain(obj):
    """Convert to plain Python **and** replace every non-finite float with ``None``.

    This is not cosmetic. ``json.dumps(float("nan"))`` emits a bare ``NaN`` literal, which
    is not valid JSON; PostgREST rejects the insert, ``save_model_run`` raises, and the
    worker's outer handler marks the job failed — throwing away a fit that had already
    finished sampling. It only takes one KPI week at zero (routine for a leads or orders
    KPI) or one channel with no spend to trigger it, so every float leaving this module
    passes through here.
    """
    if isinstance(obj, dict):
        return {k: _to_plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_plain(v) for v in obj]
    if isinstance(obj, (np.floating, np.integer)):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def _safe_mape(actual: np.ndarray, resid: np.ndarray) -> float:
    """Mean absolute percentage error, skipping weeks whose actual value is exactly 0.

    Returns ``nan`` only when *every* week is zero, which ``_to_plain`` then turns into
    ``null`` — an honest "not applicable" rather than a number.
    """
    denom = np.where(actual != 0, np.abs(actual), np.nan)
    with np.errstate(invalid="ignore", divide="ignore"):
        ratios = np.abs(resid) / denom
    if not np.any(np.isfinite(ratios)):
        return float("nan")
    return float(np.nanmean(ratios))


def _flat(idata, name: str) -> np.ndarray:
    """Flatten a posterior variable's chain/draw dims to a single sample axis (last)."""
    da = idata.posterior[name]
    return da.stack(sample=("chain", "draw")).to_numpy()


def _channel_param_names(ch: ChannelConfig) -> list[str]:
    """The scalar RV names this channel registers, given its adstock/saturation choice.

    Kept in lock-step with :func:`mmm_core.model.build._adstock_rvs` /
    ``_saturation_rvs`` so diagnostics never ask ArviZ for a variable that isn't there.
    """
    names = [f"beta_{ch.name}", f"alpha_{ch.name}"]
    if ch.adstock is AdstockType.DELAYED:
        names.append(f"theta_{ch.name}")
    if ch.saturation is SaturationType.HILL:
        names += [f"halfsat_{ch.name}", f"slope_{ch.name}"]
    else:  # logistic
        names.append(f"lam_{ch.name}")
    return names


def _saturation_point_samples(idata, ch: ChannelConfig, x_max_i: float) -> np.ndarray:
    """Weekly spend at half the channel's ceiling (original units), per saturation family.

    For Hill this is ``kappa`` directly; for logistic it is ``ln(3)/lam`` — both the
    spend at which the response reaches half its maximum, so they are comparable.
    """
    if ch.saturation is SaturationType.HILL:
        return _flat(idata, f"halfsat_{ch.name}") * x_max_i
    lam = _flat(idata, f"lam_{ch.name}")               # steepness on scaled spend
    return (np.log(3.0) / lam) * x_max_i


def _lag1_autocorrelation(resid: np.ndarray) -> float:
    """Lag-1 autocorrelation of the residuals.

    On a weekly time series this is the most informative residual check there is: a model
    that is systematically late (or early) leaves neighbouring residuals correlated, which
    means real structure — a missing control, the wrong carry-over — is still in there.
    R-squared cannot see it at all.
    """
    resid = np.asarray(resid, dtype=float).ravel()
    if resid.size < 3:
        return float("nan")
    centred = resid - resid.mean()
    denom = float(np.sum(centred**2))
    if denom <= 0:
        return 0.0
    return float(np.sum(centred[:-1] * centred[1:]) / denom)


def _sampler_health(idata) -> tuple[float, int]:
    """``(min E-BFMI, draws that hit the tree-depth ceiling)``.

    Both are best-effort: different samplers name their statistics differently, and a
    missing statistic must never fail an otherwise good fit. A missing E-BFMI comes back
    as NaN so the validation layer can say "not measured" rather than "fine".
    """
    import arviz as az

    try:
        bfmi = float(np.min(np.asarray(az.bfmi(idata), dtype=float)))
    except Exception:
        bfmi = float("nan")

    n_treedepth = 0
    try:
        stats = idata.sample_stats
        for depth_key, max_key in (("tree_depth", "max_tree_depth"), ("treedepth", "max_treedepth")):
            if depth_key in stats:
                depth = np.asarray(stats[depth_key].to_numpy(), dtype=float)
                ceiling = (
                    float(np.max(np.asarray(stats[max_key].to_numpy(), dtype=float)))
                    if max_key in stats
                    else 10.0  # numpyro's default
                )
                n_treedepth = int(np.sum(depth >= ceiling))
                break
    except Exception:
        n_treedepth = 0
    return bfmi, n_treedepth


def _posterior_predictive_draws(built: BuiltModel, idata, expected: np.ndarray) -> np.ndarray:
    """Posterior-predictive KPI draws ``(T, S)``, from the link the model actually used."""
    config = built.config
    rng = np.random.default_rng(0)
    if config.likelihood is LikelihoodType.POISSON:
        y = rng.poisson(np.clip(expected, 0.0, None))
    elif config.likelihood is LikelihoodType.NEGATIVE_BINOMIAL:
        alpha = _flat(idata, "nb_alpha")[None, :]              # (1, S)
        mean = np.clip(expected, 1e-9, None)
        p = np.clip(alpha / (alpha + mean), 1e-9, 1.0)
        y = rng.negative_binomial(np.broadcast_to(alpha, expected.shape), p)
    else:
        y_max = float(built.scalers["y_max"])
        sigma = _flat(idata, "sigma")                          # (S,)
        if config.likelihood is LikelihoodType.STUDENT_T:
            noise = rng.standard_t(config.student_t_nu, size=expected.shape)
        else:
            noise = rng.standard_normal(expected.shape)
        y = expected + sigma[None, :] * y_max * noise
    return y


def _weekly_attribution(built: BuiltModel, idata) -> tuple[np.ndarray, dict[str, np.ndarray], np.ndarray]:
    """Per-week posterior KPI, per-channel contribution, and baseline — link-aware.

    Returns ``(expected, channel_week, baseline_week)`` as ``(T, S)`` arrays in original
    KPI units. For the additive link this is exact; for the count (log) link the media
    effect is multiplicative, so each channel's *standalone* counterfactual lift is scaled
    to add up to the total media effect (a Shapley-style proportional allocation). In both
    cases ``baseline_week + sum(channel_week) == expected`` holds, so the decomposition
    check stays exact.
    """
    config = built.config
    y_max = float(built.scalers["y_max"])
    mu = _flat(idata, "mu")                                     # (T, S)
    contribs = {ch.name: _flat(idata, f"contrib_{ch.name}") for ch in config.channels}

    if config.likelihood.is_count:
        expected = np.exp(mu)                                   # count units
        sum_contrib = sum(contribs.values())
        baseline_week = np.exp(mu - sum_contrib)               # exp(baseline log-effect)
        total_media = expected - baseline_week                 # >= 0
        raw = {n: expected - np.exp(mu - c) for n, c in contribs.items()}  # standalone lift
        sum_raw = sum(raw.values())
        with np.errstate(invalid="ignore", divide="ignore"):
            channel_week = {
                n: np.where(sum_raw > 0, r / sum_raw, 0.0) * total_media for n, r in raw.items()
            }
        return expected, channel_week, baseline_week

    expected = mu * y_max
    channel_week = {n: c * y_max for n, c in contribs.items()}
    baseline_week = expected - sum(channel_week.values())
    return expected, channel_week, baseline_week


def _baseline_decomposition(built: BuiltModel, idata, baseline_week: np.ndarray) -> "BaselineDecomposition":
    """Split the per-week baseline into level/trend/season/controls (median KPI units).

    Reads the per-week baseline sub-component Deterministics registered in build.py. For the
    additive link the parts are simply the scaled components × y_max and sum to the baseline
    exactly. For the count (log) link the components combine multiplicatively, so — exactly as
    :func:`_weekly_attribution` does for channels — each part is the drop when that component
    is removed, renormalized to sum back to the (positive) baseline.
    """
    config = built.config
    y_max = float(built.scalers["y_max"])

    comps: dict[str, np.ndarray] = {
        "niveau": np.broadcast_to(_flat(idata, "intercept")[None, :], baseline_week.shape),
    }
    if config.add_trend:
        comps["trend"] = _flat(idata, "trend_effect")
    if config.seasonality_periods and config.n_fourier_modes > 0:
        comps["seizoen"] = _flat(idata, "season_effect")
    if config.control_columns:
        comps["externe_factoren"] = _flat(idata, "controls_effect")

    if config.likelihood.is_count:
        log_total = sum(comps.values())                       # == mu - sum(contrib), (T, S)
        raw = {k: baseline_week - np.exp(log_total - v) for k, v in comps.items()}
        sum_raw = sum(raw.values())
        with np.errstate(invalid="ignore", divide="ignore"):
            parts = {
                k: np.where(np.abs(sum_raw) > 1e-12, r / sum_raw, 0.0) * baseline_week
                for k, r in raw.items()
            }
    else:
        parts = {k: v * y_max for k, v in comps.items()}

    return BaselineDecomposition(
        dates=[str(d.date()) for d in built.dates],
        components={k: [float(x) for x in np.median(v, axis=1)] for k, v in parts.items()},
        control_names=list(config.control_columns),
    )


def lag_matrix(x: np.ndarray, l_max: int) -> np.ndarray:
    """``(T, l_max)`` matrix with ``X[t, l] = x[t - l]`` (0 before the series starts)."""
    T = len(x)
    out = np.zeros((T, l_max), dtype=float)
    for lag in range(min(l_max, T)):
        out[lag:, lag] = x[: T - lag]
    return out


def adstock_direct_fraction(x: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Per-week fraction of the adstocked spend stock coming from THAT week's spend.

    ``x`` is a channel's weekly spend ``(T,)``; ``weights`` are normalized lag weights
    ``(l_max, S)`` (one column per posterior sample). Returns ``(T, S)`` fractions in
    [0, 1]; weeks with an empty stock get 0. Scale-invariant, so it is the same whether
    computed on raw or max-scaled spend.
    """
    lags = lag_matrix(np.asarray(x, dtype=float), weights.shape[0])   # (T, l_max)
    stock = lags @ weights                                            # (T, S)
    direct = np.asarray(x, dtype=float)[:, None] * weights[0][None, :]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(stock > 0, direct / stock, 0.0)


def _adstock_weight_samples(idata, ch: ChannelConfig) -> np.ndarray:
    """Normalized adstock lag-weight samples ``(l_max, S)`` — mirrors build.py's
    ``_pt_geometric_adstock`` / ``_pt_delayed_adstock`` in numpy."""
    alpha = np.clip(_flat(idata, f"alpha_{ch.name}"), 1e-9, 1.0 - 1e-9)   # (S,)
    lags = np.arange(ch.l_max, dtype=float)[:, None]                       # (l_max, 1)
    if ch.adstock is AdstockType.GEOMETRIC:
        w = alpha[None, :] ** lags
    else:
        theta = _flat(idata, f"theta_{ch.name}")                           # (S,)
        w = alpha[None, :] ** ((lags - theta[None, :]) ** 2)
    return w / w.sum(axis=0, keepdims=True)


def summarize_fit(
    built: BuiltModel,
    idata,
    *,
    holdout_mape: float | None = None,
    placebo_share: float | None = None,
) -> FitSummary:
    """Turn a fitted model + InferenceData into the dashboard summary.

    ``holdout_mape`` and ``placebo_share`` are the out-of-sample evidence. They come from
    extra fits the caller runs (see :mod:`mmm_worker.runner`), so they are optional here —
    but without them a fit can never reach ``USABLE_FOR_DECISIONS``, and therefore never
    produces budget advice. That is deliberate: the advice is only as good as the evidence
    that the model generalises.
    """
    import arviz as az

    config = built.config
    x_max = np.asarray(built.scalers["x_max"], dtype=float)
    kpi = built.kpi
    burn_in = built.burn_in
    obs = built.observed_slice          # the weeks the likelihood actually saw
    kpi_obs = kpi[obs]
    kpi_total = float(kpi_obs.sum())

    expected, channel_week, baseline_week = _weekly_attribution(built, idata)

    # --- per-channel attribution (in original KPI / pressure units) ---
    # Everything is summed over the OBSERVED weeks only. Including the adstock warm-up
    # would credit channels with contribution in weeks the model was never scored on, and
    # divide it by spend from those same weeks — inflating or deflating every ROAS
    # depending on how the window happened to start.
    channels: list[ChannelResult] = []
    for i, ch in enumerate(config.channels):
        contrib_total = channel_week[ch.name][obs].sum(axis=0)  # (sample,), KPI units
        spend_total = float(built.spend[obs, i].sum())

        alpha = _flat(idata, f"alpha_{ch.name}")
        half_life = np.array([half_life_from_alpha(float(a)) for a in np.clip(alpha, 1e-6, 1 - 1e-9)])
        half_sat_spend = _saturation_point_samples(idata, ch, x_max[i])

        # Direct vs carry-over: allocate each week's contribution by how much of the
        # adstocked stock came from that week's own spend vs earlier weeks. The fraction is
        # computed over the FULL series (carry-over into an observed week can come from a
        # warm-up week) and then read only on the observed weeks.
        weights = _adstock_weight_samples(idata, ch)                       # (l_max, S)
        frac = adstock_direct_fraction(built.spend[:, i], weights)         # (T, S)
        direct_total = (channel_week[ch.name] * frac)[obs].sum(axis=0)     # (S,)
        carryover_total = contrib_total - direct_total
        with np.errstate(invalid="ignore", divide="ignore"):
            share = np.where(np.abs(contrib_total) > 1e-12, direct_total / contrib_total, 1.0)

        channels.append(
            ChannelResult(
                name=ch.name,
                absolute_contribution=Interval.from_samples(contrib_total),
                contribution_share=Interval.from_samples(contrib_total / kpi_total),
                roas=Interval.from_samples(contrib_total / spend_total) if spend_total > 0 else None,
                adstock_half_life_weeks=Interval.from_samples(half_life),
                saturation_point=Interval.from_samples(half_sat_spend),
                total_spend=spend_total,
                unit=ch.unit.value,
                direct_contribution=Interval.from_samples(direct_total),
                carryover_contribution=Interval.from_samples(carryover_total),
                direct_share=Interval.from_samples(np.clip(share, 0.0, 1.0)),
            )
        )

    # --- baseline (everything not attributed to marketing), observed weeks only ---
    baseline = Interval.from_samples(baseline_week[obs].sum(axis=0))

    # --- diagnostics ---
    var_names = ["intercept"]
    if config.likelihood is LikelihoodType.NEGATIVE_BINOMIAL:
        var_names.append("nb_alpha")
    elif not config.likelihood.is_count:
        var_names.append("sigma")
    for ch in config.channels:
        var_names += _channel_param_names(ch)
    summ = az.summary(idata, var_names=var_names)
    max_r_hat = float(summ["r_hat"].max())
    min_ess = float(summ["ess_bulk"].min())
    min_ess_tail = float(summ["ess_tail"].min()) if "ess_tail" in summ else float("nan")
    n_div = int(idata.sample_stats["diverging"].to_numpy().sum())
    min_bfmi, n_treedepth = _sampler_health(idata)

    # Goodness-of-fit is scored on the weeks the model was fitted on. Scoring the adstock
    # warm-up too would flatter or punish the model for weeks it was never asked about.
    mu_mean = expected.mean(axis=1)[obs]                       # posterior-mean fit, KPI units
    resid = kpi_obs - mu_mean
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((kpi_obs - kpi_obs.mean()) ** 2)) or 1.0
    r2 = 1.0 - ss_res / ss_tot
    # nanmean, not mean: a single week with a KPI of exactly 0 has no percentage error, and
    # np.mean over the resulting NaN turns the whole MAPE into NaN. That NaN then travelled
    # all the way into the result JSON and killed the insert.
    mape = _safe_mape(kpi_obs, resid)

    # Predictive coverage at three levels. One level can be hit by accident (a single
    # enormous interval covers everything); three moving together is evidence the
    # uncertainty itself is calibrated.
    draws_pp = _posterior_predictive_draws(built, idata, expected)
    coverage = {}
    for level, (lo_p, hi_p) in ((94, (3.0, 97.0)), (80, (10.0, 90.0)), (50, (25.0, 75.0))):
        lo = np.percentile(draws_pp, lo_p, axis=1)
        hi = np.percentile(draws_pp, hi_p, axis=1)
        coverage[level] = interval_coverage(kpi_obs, lo[obs], hi[obs])
    lo = np.percentile(draws_pp, 3.0, axis=1)
    hi = np.percentile(draws_pp, 97.0, axis=1)

    components = {n: cw.mean(axis=1) for n, cw in channel_week.items()}
    components["baseline"] = baseline_week.mean(axis=1)
    decomp = check_decomposition_adds_up(expected.mean(axis=1), components)

    diagnostics = Diagnostics(
        max_r_hat=max_r_hat,
        min_ess_bulk=min_ess,
        min_ess_tail=min_ess_tail,
        n_divergences=n_div,
        min_e_bfmi=min_bfmi,
        n_max_treedepth=n_treedepth,
        r2=r2,
        mape=mape,
        interval_coverage_94=coverage[94],
        interval_coverage_80=coverage[80],
        interval_coverage_50=coverage[50],
        residual_autocorrelation=_lag1_autocorrelation(resid),
        decomposition_ok=decomp.ok,
    )

    weekly = WeeklyDecomposition(
        dates=[str(d.date()) for d in built.dates],
        actual=[float(v) for v in kpi],
        expected_p50=[float(v) for v in np.median(expected, axis=1)],
        expected_p3=[float(v) for v in lo],
        expected_p97=[float(v) for v in hi],
        baseline_p50=[float(v) for v in np.median(baseline_week, axis=1)],
        channels_p50={n: [float(v) for v in np.median(cw, axis=1)] for n, cw in channel_week.items()},
        channel_spend={ch.name: [float(v) for v in built.spend[:, i]] for i, ch in enumerate(config.channels)},
        burn_in_weeks=burn_in,
    )
    baseline_decomposition = _baseline_decomposition(built, idata, baseline_week)

    # --- identifiability, then the verdict, then the outputs it allows ---------------
    # Order matters: the planning outputs are only computed once we know they may be
    # shown, so an unusable model cannot leave a stale budget recommendation lying around
    # in the stored result for a UI to find later.
    contribution_totals = {
        name: cw[obs].sum(axis=0) for name, cw in channel_week.items()
    }
    identifiability = assess_identifiability(
        contribution_totals,
        prior_samples=prior_effect_samples(config, n=4000),
        posterior_samples={
            ch.name: _flat(idata, f"beta_{ch.name}") for ch in config.channels
        },
    )

    n_draws = int(idata.posterior.sizes["draw"])
    n_chains = int(idata.posterior.sizes["chain"])
    validation = validate_run(
        diagnostics,
        n_samples=n_draws * n_chains,
        identifiability=identifiability,
        holdout_mape=holdout_mape,
        placebo_share=placebo_share,
        channel_shares=[c.contribution_share.p50 for c in channels],
    )

    response_curves: list[ResponseCurve] = []
    optimal_allocation: OptimalAllocation | None = None
    efficiency_frontier: list[FrontierPoint] = []
    if validation.allows(Output.RESPONSE_CURVES) or validation.allows(Output.BUDGET_ADVICE):
        # The channels the verdict says get no individual number are also the channels no
        # euro may be moved into: the optimiser holds them at today's level.
        unidentifiable = frozenset(p.name for p in validation.per_channel if not p.usable)
        response_curves, optimal_allocation, efficiency_frontier = _planning_outputs(
            built, idata, unidentifiable=unidentifiable
        )
        if not validation.allows(Output.BUDGET_ADVICE):
            optimal_allocation, efficiency_frontier = None, []

    return FitSummary(
        kpi=config.kpi,
        kpi_type=config.kpi_type.value,
        n_weeks=len(built.dates) - burn_in,
        window=(str(built.dates[burn_in].date()), str(built.dates.max().date())),
        baseline_contribution=baseline,
        channels=channels,
        diagnostics=diagnostics,
        draws=n_draws,
        chains=n_chains,
        validation=validation,
        identifiability=list(identifiability.channels),
        response_curves=response_curves,
        weekly=weekly,
        baseline_decomposition=baseline_decomposition,
        optimal_allocation=optimal_allocation,
        efficiency_frontier=efficiency_frontier,
    )


def _planning_outputs(
    built: BuiltModel, idata, *, unidentifiable: frozenset[str] = frozenset()
) -> tuple[list[ResponseCurve], "OptimalAllocation | None", list[FrontierPoint]]:
    """Response curves, best reallocation of the current budget, and an efficiency frontier
    around it — all from the one posterior.

    Pure post-processing of the fitted samples — no re-sampling — so it is cheap enough to
    run on every fit. Wrapped defensively: a planning-output failure (e.g. the optimizer
    not converging) must never fail an otherwise-good fit.
    """
    from mmm_core.optimize import (
        Interval as _OI,
        efficiency_frontier as _frontier,
        efficiency_frontier_count as _frontier_count,
        extract_channel_responses,
        marginal_roas,
        optimize_budget,
        optimize_budget_count,
        response_curve,
    )

    def _iv(x: _OI) -> Interval:
        return Interval(x.p3, x.p50, x.p97)

    curves: list[ResponseCurve] = []
    allocation: OptimalAllocation | None = None
    frontier: list[FrontierPoint] = []
    is_count = built.config.likelihood.is_count
    try:
        responses = extract_channel_responses(built, idata)

        # Count (log) link: the model is multiplicative, so a channel's steady-state
        # contribution needs a reference level for "everything else" in log space —
        # computed here the same way _weekly_attribution derives per-week attribution,
        # just averaged over weeks into one steady-state number per posterior sample.
        # Two different references, deliberately: `other_log_effect[c]` holds every OTHER
        # channel at its current spend (for that channel's own response curve, where only
        # its own spend varies); `other_baseline_log` excludes every channel (for the
        # joint optimizer, where all channels' spend vary at once) — see
        # optimize.optimize_budget_count's docstring for why these must differ.
        other_log_effect: dict[str, np.ndarray] | None = None
        other_baseline_log: np.ndarray | None = None
        if is_count:
            mu = _flat(idata, "mu")  # (T, S)
            contribs = {ch.name: _flat(idata, f"contrib_{ch.name}") for ch in built.config.channels}
            sum_contrib = sum(contribs.values())
            other_baseline_log = (mu - sum_contrib).mean(axis=0)  # (S,)
            other_log_effect = {name: (mu - c).mean(axis=0) for name, c in contribs.items()}

        obs = built.observed_slice
        for i, r in enumerate(responses):
            current = float(built.spend[obs, i].mean())
            other = other_log_effect[r.name] if is_count else None
            pts = [
                CurvePoint(p.weekly_spend, _iv(p.contribution), p.extrapolated)
                for p in response_curve(r, n_points=25, other_log_effect=other)
            ]
            curves.append(
                ResponseCurve(
                    name=r.name,
                    current_weekly_spend=current,
                    marginal_roas_at_current=_iv(marginal_roas(r, current, other_log_effect=other)),
                    points=pts,
                )
            )
        # A budget can only be reallocated across channels denominated in money. Mixing
        # euros with GRPs or e-mail sendings into one "total weekly budget" and optimising
        # that produces a confident-looking number that means nothing.
        #
        # A channel the model cannot tell apart from another is held fixed for the same
        # reason: its own effect is not established, so moving money into or out of it on
        # the strength of this posterior is advice about an unanswered question. It keeps
        # its response curve — the curve is honest about its own width — but it does not
        # get traded.
        def _tradeable(r) -> bool:
            return r.is_monetary and r.name not in unidentifiable

        monetary = [r for r in responses if _tradeable(r)]
        fixed = [r.name for r in responses if not _tradeable(r)]
        monetary_idx = [
            i
            for i, ch in enumerate(built.config.channels)
            if ch.unit.is_monetary and ch.name not in unidentifiable
        ]
        total_current = float(sum(built.spend[obs, i].mean() for i in monetary_idx))
        if monetary and total_current > 0:
            if is_count:
                alloc = optimize_budget_count(monetary, other_baseline_log, total_current)
            else:
                alloc = optimize_budget(monetary, total_current)
            allocation = OptimalAllocation(
                total_weekly_budget=alloc.total_budget,
                per_channel=alloc.per_channel,
                predicted_contribution=_iv(alloc.predicted_contribution),
                capped_channels=alloc.capped_channels,
                fixed_channels=fixed,
            )
            # Sweep total budget around today's level so the client can see whether
            # spending more (or less) in total is worth it — diminishing returns made visible.
            budgets = [total_current * f for f in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0)]
            frontier_points = (
                _frontier_count(monetary, other_baseline_log, budgets)
                if is_count
                else _frontier(monetary, budgets)
            )
            frontier = [
                FrontierPoint(total_weekly_budget=p.total_budget, predicted_contribution=_iv(p.predicted_contribution))
                for p in frontier_points
            ]
    except Exception:
        # planning outputs are a bonus on top of the fit; never let them break it
        return curves, allocation, frontier
    return curves, allocation, frontier


def fit_model(
    data: pd.DataFrame,
    config: ModelConfig,
    *,
    draws: int = 1000,
    tune: int = 1000,
    chains: int = 4,
    target_accept: float = 0.95,
    seed: int = 0,
    progressbar: bool = False,
    holdout_mape: float | None = None,
    placebo_share: float | None = None,
):
    """Build, sample (numpyro NUTS) and summarize the model.

    Returns:
        ``(FitSummary, InferenceData)`` — the summary is the small JSON for Postgres,
        the InferenceData is the raw trace destined for Storage as a ``.nc``.
    """
    import pymc as pm

    built = build_model(data, config)
    with built.model:
        idata = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            target_accept=target_accept,
            nuts_sampler="numpyro",
            random_seed=seed,
            progressbar=progressbar,
        )
    return (
        summarize_fit(built, idata, holdout_mape=holdout_mape, placebo_share=placebo_share),
        idata,
    )
