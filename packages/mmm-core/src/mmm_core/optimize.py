"""Response curves, marginal ROAS and budget optimisation.

These are the "Toekomst & Planning" outputs: given the fitted posterior, what does each
channel return at a given weekly spend, what does the *next* euro return (mROAS), and how
should a budget be split to maximise the KPI.

Key simplification: at **steady state** (a constant weekly spend), geometric adstock with
normalised weights is the identity (constant in → constant out), so the steady-state
response is just ``beta * hill(spend)``. That makes the curves clean functions of spend.

Safety rule from the build plan: never extrapolate a channel beyond a small margin above
its **historically tested** maximum weekly spend without flagging it. Points past that
cap are marked ``extrapolated=True``; the optimiser caps allocations there by default.

Everything here is pure numpy/scipy over posterior sample arrays, so it is testable
without running a fit — construct the samples directly.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Numerical offset mirroring the model's saturation (mmm_core.model.build._HILL_EPS).
_HILL_EPS = 1e-6
# Default safety margin above the historically tested maximum weekly spend.
_DEFAULT_CAP_FACTOR = 1.2


def _hill_shape(u, half_saturation, slope):
    return (u + _HILL_EPS) ** slope / (
        half_saturation ** slope + (u + _HILL_EPS) ** slope
    )


def _logistic_shape(u, lam):
    e = np.exp(-lam * (u + _HILL_EPS))
    return (1.0 - e) / (1.0 + e)


@dataclass
class ChannelResponse:
    """Posterior response parameters for one channel, in real spend/KPI units.

    Steady-state response is ``beta * saturation(spend/x_max)``: at a constant weekly
    spend any *normalized* adstock (geometric or delayed) is the identity, so only the
    saturation shape matters here — this holds for every adstock the model offers.

    Attributes are posterior sample arrays of shape ``(n_samples,)`` unless noted.

    Args:
        name: Channel name.
        beta: Channel ceiling (scaled-KPI units), posterior samples.
        x_max: Spend scaler (the max weekly spend used to scale the channel at fit time).
        y_max: KPI scaler.
        hist_max_weekly_spend: Highest weekly spend actually observed for this channel.
        saturation: ``"hill"`` or ``"logistic"``.
        half_saturation: Hill half-saturation on *scaled* spend (posterior); Hill only.
        slope: Hill slope (posterior); Hill only.
        lam: Logistic steepness on *scaled* spend (posterior); logistic only.
    """

    name: str
    beta: np.ndarray
    x_max: float
    y_max: float
    hist_max_weekly_spend: float
    saturation: str = "hill"
    half_saturation: np.ndarray | None = None
    slope: np.ndarray | None = None
    lam: np.ndarray | None = None

    def _shape(self, u: float) -> np.ndarray:
        if self.saturation == "logistic":
            return _logistic_shape(u, self.lam)
        return _hill_shape(u, self.half_saturation, self.slope)

    def own_log_effect(self, weekly_spend: float) -> np.ndarray:
        """This channel's own additive term inside the log-link linear predictor ``mu``
        at a constant ``weekly_spend`` (posterior samples, scaled units) — exactly the
        steady-state value of the model's ``contrib_{name}`` Deterministic. Used directly
        by :meth:`contribution_samples` for the additive link, and as the multiplicative
        building block for the count/log link (see there).

        The tiny ``_HILL_EPS`` pedestal (present only for gradient stability during the
        fit) is subtracted here so this is exactly 0 at zero spend.
        """
        if weekly_spend < 0:
            raise ValueError("weekly_spend must be non-negative")
        u = weekly_spend / self.x_max
        return self.beta * (self._shape(u) - self._shape(0.0))

    def contribution_samples(
        self, weekly_spend: float, *, other_log_effect: np.ndarray | None = None
    ) -> np.ndarray:
        """Steady-state KPI contribution at a constant ``weekly_spend`` (posterior samples).

        Additive link (``other_log_effect=None``, the default — Normal/Student-T KPIs):
        ``beta * (shape(u) - shape(0)) * y_max``, independent of every other channel or
        the baseline, because the additive model sums contributions directly in KPI units.

        Count link (``other_log_effect`` given — Poisson/negative-binomial KPIs, log link):
        the model is multiplicative (``KPI = exp(mu)``, and this channel enters ``mu``
        additively), so there is no channel-only contribution independent of the rest of
        the model. ``other_log_effect`` is the steady-state level (posterior samples, log
        space) of *everything else* holding this channel's spend at ``weekly_spend`` —
        typically "baseline + trend + season + controls + every other channel at its
        current/average spend" for a single-channel response curve, computed by
        :func:`mmm_core.model.fit._planning_outputs`. The return value is
        ``exp(other_log_effect + own_log_effect(weekly_spend)) - exp(other_log_effect)``:
        the marginal KPI lift from moving *this* channel from 0 to ``weekly_spend``,
        holding everything else fixed — the same counterfactual logic already used for
        per-week count-likelihood attribution in
        :func:`mmm_core.model.fit._weekly_attribution`, just evaluated at one steady-state
        spend level instead of per observed week. Exactly 0 at ``weekly_spend=0`` by the
        same construction as the additive case.
        """
        own = self.own_log_effect(weekly_spend)
        if other_log_effect is None:
            return own * self.y_max
        return np.exp(other_log_effect + own) - np.exp(other_log_effect)

    def cap(self, cap_factor: float = _DEFAULT_CAP_FACTOR) -> float:
        return self.hist_max_weekly_spend * cap_factor


@dataclass
class Interval:
    p3: float
    p50: float
    p97: float

    @staticmethod
    def of(samples: np.ndarray) -> "Interval":
        lo, mid, hi = np.percentile(samples, [3, 50, 97])
        return Interval(float(lo), float(mid), float(hi))


@dataclass
class ResponsePoint:
    weekly_spend: float
    contribution: Interval
    extrapolated: bool


def response_curve(
    channel: ChannelResponse,
    *,
    n_points: int = 40,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
    other_log_effect: np.ndarray | None = None,
) -> list[ResponsePoint]:
    """Steady-state response curve from 0 up to ``cap_factor`` × historical max spend.

    ``other_log_effect``: pass for a count/log-link channel (see
    :meth:`ChannelResponse.contribution_samples`); leave ``None`` for the additive link.
    """
    top = channel.cap(cap_factor)
    grid = np.linspace(0.0, top, n_points)
    points = []
    for x in grid:
        points.append(
            ResponsePoint(
                weekly_spend=float(x),
                contribution=Interval.of(
                    channel.contribution_samples(float(x), other_log_effect=other_log_effect)
                ),
                extrapolated=bool(x > channel.hist_max_weekly_spend),
            )
        )
    return points


def marginal_roas(
    channel: ChannelResponse,
    at_weekly_spend: float,
    *,
    h: float | None = None,
    other_log_effect: np.ndarray | None = None,
) -> Interval:
    """Marginal ROAS: the KPI return on the next euro at ``at_weekly_spend`` (posterior)."""
    if h is None:
        h = max(channel.x_max * 1e-4, 1e-6)
    lo = max(at_weekly_spend - h, 0.0)
    hi = at_weekly_spend + h
    d = (
        channel.contribution_samples(hi, other_log_effect=other_log_effect)
        - channel.contribution_samples(lo, other_log_effect=other_log_effect)
    ) / (hi - lo)
    return Interval.of(d)


def average_roas(channel: ChannelResponse, at_weekly_spend: float) -> Interval:
    """Average ROAS at a spend level: total contribution / spend (posterior)."""
    if at_weekly_spend <= 0:
        raise ValueError("average ROAS is undefined at zero spend")
    return Interval.of(channel.contribution_samples(at_weekly_spend) / at_weekly_spend)


@dataclass
class Allocation:
    per_channel: dict[str, float]
    total_budget: float
    predicted_contribution: Interval   # total KPI from marketing at this allocation
    capped_channels: list[str]         # channels pushed to their safety cap


def predict_total_contribution(
    channels: list[ChannelResponse], allocation: dict[str, float]
) -> Interval:
    """Posterior total marketing contribution for a given per-channel weekly allocation."""
    by_name = {c.name: c for c in channels}
    total = None
    for name, spend in allocation.items():
        samples = by_name[name].contribution_samples(spend)
        total = samples if total is None else total + samples
    return Interval.of(total)


def optimize_budget(
    channels: list[ChannelResponse],
    total_budget: float,
    *,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
    min_spend: dict[str, float] | None = None,
    max_spend: dict[str, float] | None = None,
) -> Allocation:
    """Split ``total_budget`` across channels to maximise the (median) steady-state KPI.

    Optimises on the posterior-median response curves, then evaluates the resulting
    allocation across the full posterior to attach a credible interval.

    Args:
        cap_factor: Safety margin above each channel's historical max spend; the optimiser
            never allocates beyond this (extrapolation guard from the build plan).
        min_spend: Optional per-channel lower bounds (e.g. contractual minimums or "don't
            drop below current"). Their sum must not exceed ``total_budget``.
        max_spend: Optional per-channel upper bounds, applied *on top of* the safety cap
            (the tighter of the two wins).
    """
    from scipy.optimize import minimize

    if total_budget <= 0:
        raise ValueError("total_budget must be > 0")

    min_spend = min_spend or {}
    max_spend = max_spend or {}
    n = len(channels)
    lows = np.array([max(0.0, min_spend.get(c.name, 0.0)) for c in channels])
    caps = np.array([c.cap(cap_factor) for c in channels])
    highs = np.array([min(caps[i], max_spend.get(c.name, caps[i])) for i, c in enumerate(channels)])
    if np.any(lows > highs + 1e-9):
        raise ValueError("a channel's min_spend exceeds its cap/max_spend")
    if float(lows.sum()) > total_budget + 1e-6:
        raise ValueError("sum of min_spend exceeds total_budget")

    # Median parameters give a smooth deterministic objective for the optimiser.
    def _median_shape(c):
        if c.saturation == "logistic":
            lam = np.median(c.lam)
            return lambda u: _logistic_shape(u, lam)
        hs, slope = np.median(c.half_saturation), np.median(c.slope)
        return lambda u: _hill_shape(u, hs, slope)

    med = [(np.median(c.beta), _median_shape(c), c.x_max, c.y_max) for c in channels]

    def contrib_median(x, params):
        beta, shape, x_max, y_max = params
        u = x / x_max
        return beta * (shape(u) - shape(0.0)) * y_max

    def neg_total(x):
        return -sum(contrib_median(xi, p) for xi, p in zip(x, med))

    feasible_total = min(total_budget, float(highs.sum()))
    feasible_total = max(feasible_total, float(lows.sum()))
    # Start feasible: minimums plus an even share of the remaining budget.
    slack = feasible_total - float(lows.sum())
    x0 = lows + (slack / n if n else 0.0)
    bounds = list(zip(lows, highs))
    constraints = [{"type": "eq", "fun": lambda x: np.sum(x) - feasible_total}]

    res = minimize(neg_total, x0, method="SLSQP", bounds=bounds, constraints=constraints)
    alloc = {c.name: float(np.clip(xi, lo, hi)) for c, xi, lo, hi in zip(channels, res.x, lows, highs)}

    capped = [c.name for c, xi in zip(channels, res.x) if xi >= c.cap(cap_factor) - 1e-6]
    predicted = predict_total_contribution(channels, alloc)
    return Allocation(
        per_channel=alloc,
        total_budget=float(feasible_total),
        predicted_contribution=predicted,
        capped_channels=capped,
    )


@dataclass
class FrontierPoint:
    total_budget: float
    allocation: dict[str, float]
    predicted_contribution: Interval


def efficiency_frontier(
    channels: list[ChannelResponse],
    budgets: list[float],
    *,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
    min_spend: dict[str, float] | None = None,
    max_spend: dict[str, float] | None = None,
) -> list[FrontierPoint]:
    """Optimal allocation at each total budget — the diminishing-returns curve of *total*
    spend. Answers "how much should we spend in total?", not just "how to split it".
    """
    points: list[FrontierPoint] = []
    for b in sorted(budgets):
        alloc = optimize_budget(
            channels, b, cap_factor=cap_factor, min_spend=min_spend, max_spend=max_spend
        )
        points.append(
            FrontierPoint(
                total_budget=alloc.total_budget,
                allocation=alloc.per_channel,
                predicted_contribution=alloc.predicted_contribution,
            )
        )
    return points


def optimize_budget_count(
    channels: list[ChannelResponse],
    other_baseline_log: np.ndarray,
    total_budget: float,
    *,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
    min_spend: dict[str, float] | None = None,
    max_spend: dict[str, float] | None = None,
) -> Allocation:
    """Budget split that maximises the *joint* count KPI under a log link.

    ``optimize_budget`` (additive link) sums independently-computed per-channel curves,
    which is exact there because the additive model really is a sum. The count/log link
    is multiplicative instead — ``expected = exp(other_baseline_log + sum_c
    own_log_effect_c(spend_c))`` — so simultaneously changing several channels' spend has
    an interaction effect a sum of independent per-channel deltas would miss. This
    optimises that real joint objective directly (on posterior-median parameters, same
    convention as ``optimize_budget``), rather than approximating it.

    ``other_baseline_log`` is the steady-state, log-space level of *everything that is not
    a media channel* (baseline + trend + season + controls) — posterior samples, shape
    ``(S,)`` — computed by :func:`mmm_core.model.fit._planning_outputs`. This is
    deliberately a different reference than the ``other_log_effect`` passed to a single
    channel's :meth:`ChannelResponse.contribution_samples` (which also holds *other
    channels* fixed at their current spend): here every channel's spend is a free
    optimisation variable, so no channel's current contribution belongs in the reference.
    """
    from scipy.optimize import minimize

    if total_budget <= 0:
        raise ValueError("total_budget must be > 0")
    if not channels:
        raise ValueError("optimize_budget_count needs at least one channel")

    min_spend = min_spend or {}
    max_spend = max_spend or {}
    n = len(channels)
    lows = np.array([max(0.0, min_spend.get(c.name, 0.0)) for c in channels])
    caps = np.array([c.cap(cap_factor) for c in channels])
    highs = np.array([min(caps[i], max_spend.get(c.name, caps[i])) for i, c in enumerate(channels)])
    if np.any(lows > highs + 1e-9):
        raise ValueError("a channel's min_spend exceeds its cap/max_spend")
    if float(lows.sum()) > total_budget + 1e-6:
        raise ValueError("sum of min_spend exceeds total_budget")

    def _median_shape(c):
        if c.saturation == "logistic":
            lam = np.median(c.lam)
            return lambda u: _logistic_shape(u, lam)
        hs, slope = np.median(c.half_saturation), np.median(c.slope)
        return lambda u: _hill_shape(u, hs, slope)

    med = [(np.median(c.beta), _median_shape(c), c.x_max) for c in channels]
    other_median = float(np.median(other_baseline_log))

    def own_log_effect_median(x, params):
        beta, shape, x_max = params
        u = x / x_max
        return beta * (shape(u) - shape(0.0))

    def neg_total(x):
        joint = other_median + sum(own_log_effect_median(xi, p) for xi, p in zip(x, med))
        return -(np.exp(joint) - np.exp(other_median))

    feasible_total = min(total_budget, float(highs.sum()))
    feasible_total = max(feasible_total, float(lows.sum()))
    slack = feasible_total - float(lows.sum())
    x0 = lows + (slack / n if n else 0.0)
    bounds = list(zip(lows, highs))
    constraints = [{"type": "eq", "fun": lambda x: np.sum(x) - feasible_total}]

    res = minimize(neg_total, x0, method="SLSQP", bounds=bounds, constraints=constraints)
    alloc = {c.name: float(np.clip(xi, lo, hi)) for c, xi, lo, hi in zip(channels, res.x, lows, highs)}
    capped = [c.name for c, xi in zip(channels, res.x) if xi >= c.cap(cap_factor) - 1e-6]

    # Credible interval on the resulting joint contribution, over the full posterior this
    # time (not just the median) — same exp(other + sum of own effects) - exp(other) form.
    joint_own = None
    for c in channels:
        own = c.own_log_effect(alloc[c.name])
        joint_own = own if joint_own is None else joint_own + own
    predicted = Interval.of(np.exp(other_baseline_log + joint_own) - np.exp(other_baseline_log))

    return Allocation(
        per_channel=alloc,
        total_budget=float(feasible_total),
        predicted_contribution=predicted,
        capped_channels=capped,
    )


def efficiency_frontier_count(
    channels: list[ChannelResponse],
    other_baseline_log: np.ndarray,
    budgets: list[float],
    *,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
    min_spend: dict[str, float] | None = None,
    max_spend: dict[str, float] | None = None,
) -> list[FrontierPoint]:
    """``efficiency_frontier``'s count/log-link counterpart — see
    :func:`optimize_budget_count` for why this needs its own joint objective."""
    points: list[FrontierPoint] = []
    for b in sorted(budgets):
        alloc = optimize_budget_count(
            channels, other_baseline_log, b,
            cap_factor=cap_factor, min_spend=min_spend, max_spend=max_spend,
        )
        points.append(
            FrontierPoint(
                total_budget=alloc.total_budget,
                allocation=alloc.per_channel,
                predicted_contribution=alloc.predicted_contribution,
            )
        )
    return points


def allocate_incremental_budget(
    channels: list[ChannelResponse],
    extra_budget: float,
    current: dict[str, float],
    *,
    cap_factor: float = _DEFAULT_CAP_FACTOR,
) -> Allocation:
    """Where should an *additional* ``extra_budget`` go, without cutting any channel below
    its current spend? Optimises the new total with each channel's current spend as a floor
    — so the delta lands wherever the next euro returns most."""
    if extra_budget < 0:
        raise ValueError("extra_budget must be >= 0")
    total = float(sum(current.values())) + extra_budget
    return optimize_budget(channels, total, cap_factor=cap_factor, min_spend=current)


def extract_channel_responses(built, idata) -> list[ChannelResponse]:
    """Build :class:`ChannelResponse` objects from a fitted model + InferenceData."""
    from mmm_core.model.config import SaturationType

    y_max = float(built.scalers["y_max"])
    x_max = np.asarray(built.scalers["x_max"], dtype=float)
    responses = []
    for i, ch in enumerate(built.config.channels):
        def flat(var):
            return idata.posterior[var].stack(sample=("chain", "draw")).to_numpy()

        common = dict(
            name=ch.name,
            beta=flat(f"beta_{ch.name}"),
            x_max=float(x_max[i]),
            y_max=y_max,
            hist_max_weekly_spend=float(built.spend[:, i].max()),
        )
        if ch.saturation is SaturationType.LOGISTIC:
            responses.append(ChannelResponse(saturation="logistic", lam=flat(f"lam_{ch.name}"), **common))
        else:
            responses.append(
                ChannelResponse(
                    saturation="hill",
                    half_saturation=flat(f"halfsat_{ch.name}"),
                    slope=flat(f"slope_{ch.name}"),
                    **common,
                )
            )
    return responses
