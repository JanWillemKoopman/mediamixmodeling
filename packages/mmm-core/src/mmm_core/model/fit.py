"""Fit the MMM and summarize it into the JSON the client dashboard reads.

This is the boundary the architecture cares about: the heavy ArviZ ``InferenceData``
(raw posterior) is meant for Storage as a compressed ``.nc``; the *summary* produced
here — contribution shares, cost-per-unit, adstock half-life and saturation point, each
with a credible interval, plus convergence diagnostics — is the small JSON that goes to
Postgres for fast dashboard rendering.

Uncertainty is never optional: every channel figure is reported as (p3, p50, p97).
"""

from __future__ import annotations

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
    roas: Interval                    # contribution per unit spend
    adstock_half_life_weeks: Interval
    saturation_point: Interval        # weekly spend at half-saturation, original units
    total_spend: float
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
    max_r_hat: float
    min_ess_bulk: float
    n_divergences: int
    r2: float
    mape: float
    interval_coverage_94: float       # share of weeks whose actual KPI falls in the 94% PI
    decomposition_ok: bool


@dataclass
class QualityGate:
    """An automatic verdict on whether a fit is trustworthy enough to show a client.

    ``verdict`` is ``"pass"`` / ``"warn"`` / ``"fail"``. ``reasons`` are human-readable
    (Dutch) explanations for anything that is not clean; ``checks`` is the per-check
    boolean map. A ``fail`` means do not publish without investigating.
    """

    verdict: str
    reasons: list[str]
    checks: dict[str, bool]


# Gate thresholds — deliberately explicit so the bar is auditable, not hidden in code.
_RHAT_FAIL, _RHAT_WARN = 1.1, 1.05
_DIVERGENCE_FAIL_FRAC = 0.02      # >2% of samples diverging is a hard fail
_ESS_WARN = 400.0
_COVERAGE_TOL = 0.1
_R2_WARN = 0.3
_CV_MAPE_WARN = 0.25


def _quality_gate(
    d: "Diagnostics",
    n_samples: int,
    *,
    placebo_ok: bool | None = None,
    cv_mape: float | None = None,
) -> "QualityGate":
    """Turn diagnostics (+ optional placebo/CV results) into a pass/warn/fail verdict."""
    checks: dict[str, bool] = {}
    fails: list[str] = []
    warns: list[str] = []

    checks["converged_r_hat"] = d.max_r_hat <= _RHAT_FAIL
    if d.max_r_hat > _RHAT_FAIL:
        fails.append(f"model niet geconvergeerd (max R-hat {d.max_r_hat:.3f} > {_RHAT_FAIL})")
    elif d.max_r_hat > _RHAT_WARN:
        warns.append(f"convergentie krap (max R-hat {d.max_r_hat:.3f})")

    div_frac = d.n_divergences / max(n_samples, 1)
    checks["few_divergences"] = div_frac <= _DIVERGENCE_FAIL_FRAC
    if div_frac > _DIVERGENCE_FAIL_FRAC:
        fails.append(f"te veel divergenties ({d.n_divergences}, {div_frac:.1%} van de samples)")
    elif d.n_divergences > 0:
        warns.append(f"{d.n_divergences} divergentie(s) — resultaat met voorzichtigheid lezen")

    checks["decomposition_adds_up"] = d.decomposition_ok
    if not d.decomposition_ok:
        fails.append("decompositie telt niet op tot het totaal")

    checks["enough_ess"] = d.min_ess_bulk >= _ESS_WARN
    if d.min_ess_bulk < _ESS_WARN:
        warns.append(f"lage effectieve steekproef (min ESS {d.min_ess_bulk:.0f})")

    checks["coverage_ok"] = abs(d.interval_coverage_94 - 0.94) <= _COVERAGE_TOL
    if not checks["coverage_ok"]:
        warns.append(f"onzekerheidsdekking wijkt af ({d.interval_coverage_94:.0%} i.p.v. 94%)")

    checks["explains_data"] = d.r2 >= _R2_WARN
    if d.r2 < _R2_WARN:
        warns.append(f"model verklaart weinig (R² {d.r2:.2f})")

    if placebo_ok is not None:
        checks["placebo_clean"] = placebo_ok
        if not placebo_ok:
            fails.append("placebo-test gezakt: een random kanaal krijgt een te grote bijdrage")

    if cv_mape is not None:
        checks["cross_validation_ok"] = cv_mape <= _CV_MAPE_WARN
        if cv_mape > _CV_MAPE_WARN:
            warns.append(f"zwakke generalisatie (out-of-sample MAPE {cv_mape:.0%})")

    verdict = "fail" if fails else ("warn" if warns else "pass")
    return QualityGate(verdict=verdict, reasons=fails + warns, checks=checks)


def recompute_quality_gate(
    summary: "FitSummary",
    *,
    placebo_ok: bool | None = None,
    cv_mape: float | None = None,
) -> "FitSummary":
    """Re-derive the quality gate with extra evaluation results folded in.

    Pure post-processing on an already-produced :class:`FitSummary` (same pattern as
    :func:`_planning_outputs`): for a caller that ran ``mmm_core.evaluation.time_series_cv``
    and/or ``judge_placebo`` separately after the main fit — those are opt-in, extra fits,
    not part of :func:`fit_model` itself — and wants the result reflected in the gate this
    summary already carries. Diagnostics are untouched; only ``quality_gate`` is replaced.
    """
    n_samples = summary.draws * summary.chains
    gate = _quality_gate(summary.diagnostics, n_samples, placebo_ok=placebo_ok, cv_mape=cv_mape)
    return replace(summary, quality_gate=gate)


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
    """Best split of the *current* total weekly budget across channels (steady state)."""

    total_weekly_budget: float
    per_channel: dict[str, float]
    predicted_contribution: Interval
    capped_channels: list[str]


@dataclass
class FrontierPoint:
    total_weekly_budget: float
    predicted_contribution: Interval   # marketing KPI at the optimal split of this budget


@dataclass
class FitSummary:
    kpi: str
    n_weeks: int
    window: tuple[str, str]
    baseline_contribution: Interval   # KPI explained without marketing
    channels: list[ChannelResult]
    diagnostics: Diagnostics
    draws: int
    chains: int
    quality_gate: QualityGate | None = None
    response_curves: list[ResponseCurve] = field(default_factory=list)
    optimal_allocation: OptimalAllocation | None = None
    efficiency_frontier: list[FrontierPoint] = field(default_factory=list)
    # Optional so summaries from fits predating the weekly block keep deserializing.
    weekly: WeeklyDecomposition | None = None
    # Optional per-week breakdown of the baseline into level/trend/season/controls.
    baseline_decomposition: BaselineDecomposition | None = None

    def to_json_dict(self) -> dict:
        """A plain, JSON-serializable dict (what the worker writes to Postgres)."""
        return _to_plain(asdict(self))


def _to_plain(obj):
    if isinstance(obj, dict):
        return {k: _to_plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_plain(v) for v in obj]
    if isinstance(obj, (np.floating, np.integer)):
        return obj.item()
    return obj


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


def _posterior_predictive_band(built: BuiltModel, idata, expected: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """3rd/97th-percentile posterior-predictive band per week, drawn from the right link."""
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
    lo = np.percentile(y, 3, axis=1)
    hi = np.percentile(y, 97, axis=1)
    return lo, hi


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


def summarize_fit(built: BuiltModel, idata) -> FitSummary:
    """Turn a fitted model + InferenceData into the dashboard summary."""
    import arviz as az

    config = built.config
    x_max = np.asarray(built.scalers["x_max"], dtype=float)
    kpi = built.kpi
    kpi_total = float(kpi.sum())

    expected, channel_week, baseline_week = _weekly_attribution(built, idata)

    # --- per-channel attribution (in original KPI / spend units) ---
    channels: list[ChannelResult] = []
    for i, ch in enumerate(config.channels):
        contrib_total = channel_week[ch.name].sum(axis=0)      # (sample,), KPI units
        spend_total = float(built.spend[:, i].sum())

        alpha = _flat(idata, f"alpha_{ch.name}")
        half_life = np.array([half_life_from_alpha(float(a)) for a in np.clip(alpha, 1e-6, 1 - 1e-9)])
        half_sat_spend = _saturation_point_samples(idata, ch, x_max[i])

        # Direct vs carry-over: allocate each week's contribution by how much of the
        # adstocked stock came from that week's own spend vs earlier weeks.
        weights = _adstock_weight_samples(idata, ch)                       # (l_max, S)
        frac = adstock_direct_fraction(built.spend[:, i], weights)         # (T, S)
        direct_total = (channel_week[ch.name] * frac).sum(axis=0)          # (S,)
        carryover_total = contrib_total - direct_total
        with np.errstate(invalid="ignore", divide="ignore"):
            share = np.where(np.abs(contrib_total) > 1e-12, direct_total / contrib_total, 1.0)

        channels.append(
            ChannelResult(
                name=ch.name,
                absolute_contribution=Interval.from_samples(contrib_total),
                contribution_share=Interval.from_samples(contrib_total / kpi_total),
                roas=Interval.from_samples(contrib_total / spend_total if spend_total else contrib_total * np.nan),
                adstock_half_life_weeks=Interval.from_samples(half_life),
                saturation_point=Interval.from_samples(half_sat_spend),
                total_spend=spend_total,
                direct_contribution=Interval.from_samples(direct_total),
                carryover_contribution=Interval.from_samples(carryover_total),
                direct_share=Interval.from_samples(np.clip(share, 0.0, 1.0)),
            )
        )

    # --- baseline (everything not attributed to marketing) ---
    baseline = Interval.from_samples(baseline_week.sum(axis=0))

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
    n_div = int(idata.sample_stats["diverging"].to_numpy().sum())

    mu_mean = expected.mean(axis=1)                            # posterior-mean fit, KPI units
    resid = kpi - mu_mean
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((kpi - kpi.mean()) ** 2)) or 1.0
    r2 = 1.0 - ss_res / ss_tot
    mape = float(np.mean(np.abs(resid) / np.where(kpi != 0, np.abs(kpi), np.nan)))

    # Predictive coverage: draw from the posterior predictive appropriate to the link.
    lo, hi = _posterior_predictive_band(built, idata, expected)
    coverage = interval_coverage(kpi, lo, hi)

    components = {n: cw.mean(axis=1) for n, cw in channel_week.items()}
    components["baseline"] = baseline_week.mean(axis=1)
    decomp = check_decomposition_adds_up(expected.mean(axis=1), components)

    diagnostics = Diagnostics(
        max_r_hat=max_r_hat,
        min_ess_bulk=min_ess,
        n_divergences=n_div,
        r2=r2,
        mape=mape,
        interval_coverage_94=coverage,
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
    )
    baseline_decomposition = _baseline_decomposition(built, idata, baseline_week)

    response_curves, optimal_allocation, efficiency_frontier = _planning_outputs(built, idata)
    n_draws = int(idata.posterior.sizes["draw"])
    n_chains = int(idata.posterior.sizes["chain"])
    quality_gate = _quality_gate(diagnostics, n_draws * n_chains)

    return FitSummary(
        kpi=config.kpi,
        n_weeks=len(built.dates),
        window=(str(built.dates.min().date()), str(built.dates.max().date())),
        baseline_contribution=baseline,
        channels=channels,
        diagnostics=diagnostics,
        draws=n_draws,
        chains=n_chains,
        quality_gate=quality_gate,
        response_curves=response_curves,
        weekly=weekly,
        baseline_decomposition=baseline_decomposition,
        optimal_allocation=optimal_allocation,
        efficiency_frontier=efficiency_frontier,
    )


def _planning_outputs(
    built: BuiltModel, idata
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

        for i, r in enumerate(responses):
            current = float(built.spend[:, i].mean())
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
        total_current = float(sum(built.spend[:, i].mean() for i in range(built.spend.shape[1])))
        if total_current > 0:
            if is_count:
                alloc = optimize_budget_count(responses, other_baseline_log, total_current)
            else:
                alloc = optimize_budget(responses, total_current)
            allocation = OptimalAllocation(
                total_weekly_budget=alloc.total_budget,
                per_channel=alloc.per_channel,
                predicted_contribution=_iv(alloc.predicted_contribution),
                capped_channels=alloc.capped_channels,
            )
            # Sweep total budget around today's level so the client can see whether
            # spending more (or less) in total is worth it — diminishing returns made visible.
            budgets = [total_current * f for f in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0)]
            frontier_points = (
                _frontier_count(responses, other_baseline_log, budgets)
                if is_count
                else _frontier(responses, budgets)
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
    return summarize_fit(built, idata), idata
