"""Assemble the Bayesian MMM as a PyMC model.

The adstock and saturation transforms are written symbolically in PyTensor here
(mirroring the numpy versions in ``mmm_core.transforms``, which the tests pin), so their
parameters are sampled rather than fixed. Each channel's contribution is registered as a
``Deterministic`` so the fit can extract a decomposition and validate that it adds up.

The model is a *toolbox*, not a single fixed shape: per channel you choose the carry-over
(geometric or delayed/peaked) and the saturation (Hill or logistic); for the KPI the
likelihood follows from what the KPI counts. Every prior is a field on the config, derived
by :mod:`mmm_core.model.priors` from measured statistics of the dataset — never guessed.

Everything is fit in a scaled space (each channel's pressure by its max, the KPI by its
max) so the priors are scale-free and NUTS is well-conditioned; the scalers are returned
so :mod:`mmm_core.model.fit` can convert results back to real units.

Two things this module refuses to do, because both produce a confident number that is not
a measurement:

* fit a channel that has no usable week-to-week variation (its effect would be entirely
  prior), and
* include the leading weeks whose adstock stock is incomplete because the convolution
  zero-pads the start of the series (``burn_in_weeks``).

Heavy imports (pymc/pytensor) live in this module only; importing ``mmm_core.model`` does
not require the model extra.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from mmm_core.model.config import (
    AdstockType,
    ChannelConfig,
    LikelihoodType,
    ModelConfig,
    SaturationType,
    TrendType,
)
from mmm_core.model.datastats import (
    MIN_ACTIVE_WEEKS,
    MIN_CHANNEL_CV,
    is_effectively_constant,
)
from mmm_core.transforms import HILL_EPS as _HILL_EPS
from mmm_core.transforms import alpha_from_half_life


@dataclass
class BuiltModel:
    model: object                      # pm.Model
    scalers: dict[str, np.ndarray | float]
    config: ModelConfig
    dates: pd.DatetimeIndex
    spend: np.ndarray                  # (T, n_channels) in original units
    kpi: np.ndarray                    # (T,) in original units

    @property
    def burn_in(self) -> int:
        """Leading weeks excluded from the likelihood (adstock warm-up)."""
        return int(self.config.burn_in_weeks)

    @property
    def observed_slice(self) -> slice:
        """The weeks the model was actually fitted on."""
        return slice(self.burn_in, None)


def _fourier_features(t: np.ndarray, period: float, n_modes: int) -> np.ndarray:
    cols = []
    for k in range(1, n_modes + 1):
        cols.append(np.sin(2 * np.pi * k * t / period))
        cols.append(np.cos(2 * np.pi * k * t / period))
    return np.column_stack(cols)


def changepoint_locations(n_changepoints: int) -> np.ndarray:
    """Evenly-spaced changepoint positions in the ``[0, 1]`` scaled-time interval.

    Placed across the first ~80% of the window (Prophet's convention): late changepoints
    have too little data after them to be identifiable and would just fit noise.
    """
    return np.linspace(0.0, 0.8, n_changepoints + 1)[1:]


def changepoint_matrix(t_scaled: np.ndarray, changepoints: np.ndarray) -> np.ndarray:
    """Piecewise-linear basis ``A[i, j] = max(t_scaled[i] - changepoints[j], 0)``.

    Adding ``A @ delta`` to a base slope bends the trend at each changepoint by ``delta_j``.
    Works unchanged for out-of-sample weeks (``t_scaled > 1``), so forecasts extend the
    last segment's slope rather than inventing a new bend.
    """
    return np.maximum(t_scaled[:, None] - changepoints[None, :], 0.0)


def _pt_geometric_adstock(x, alpha, l_max: int):
    import pytensor.tensor as pt

    weights = alpha ** pt.arange(l_max)
    weights = weights / pt.sum(weights)
    return _pt_convolve(x, weights, l_max)


def _pt_delayed_adstock(x, alpha, theta, l_max: int):
    import pytensor.tensor as pt

    lags = pt.arange(l_max)
    weights = alpha ** ((lags - theta) ** 2)
    weights = weights / pt.sum(weights)
    return _pt_convolve(x, weights, l_max)


def _pt_convolve(x, weights, l_max: int):
    """Causal convolution of ``x`` with a length-``l_max`` lag-weight vector."""
    import pytensor.tensor as pt

    length = x.shape[0]
    acc = weights[0] * x
    for lag in range(1, l_max):
        shifted = pt.concatenate([pt.zeros(lag), x[: length - lag]])
        acc = acc + weights[lag] * shifted
    return acc


def _pt_hill(x, half_saturation, slope):
    xs = (x + _HILL_EPS) ** slope
    ks = half_saturation ** slope
    return xs / (ks + xs)


def _pt_logistic(x, lam):
    import pytensor.tensor as pt

    e = pt.exp(-lam * (x + _HILL_EPS))
    return (1.0 - e) / (1.0 + e)


def _adstock_rvs(pm, channel: ChannelConfig):
    """Sample a channel's adstock parameters and return ``(apply_fn, {name: rv})``.

    ``apply_fn(x)`` applies the symbolic carry-over to a spend tensor.
    """
    name = channel.name
    priors = channel.priors
    alpha_center = alpha_from_half_life(channel.half_life_prior_center())
    conc = priors.adstock_concentration
    alpha = pm.Beta(
        f"alpha_{name}",
        alpha=alpha_center * conc,
        beta=(1.0 - alpha_center) * conc,
    )
    if channel.adstock is AdstockType.GEOMETRIC:
        return (lambda x: _pt_geometric_adstock(x, alpha, channel.l_max)), {"alpha": alpha}

    theta = pm.TruncatedNormal(
        f"theta_{name}",
        mu=priors.delayed_peak_weeks,
        sigma=priors.delayed_peak_sigma,
        lower=0.0,
        upper=float(channel.l_max - 1),
    )
    return (
        lambda x: _pt_delayed_adstock(x, alpha, theta, channel.l_max),
        {"alpha": alpha, "theta": theta},
    )


def _saturation_rvs(pm, channel: ChannelConfig):
    """Sample a channel's saturation parameters and return ``(apply_fn, {name: rv})``.

    The Hill half-saturation is **LogNormal**, not Beta. A Beta on ``(0, 1)`` of max-scaled
    spend caps the half-saturation point at the historical maximum, which makes it
    impossible for the model to represent a channel that is nowhere near saturated — and
    that cap biases every marginal ROAS downwards. A LogNormal centred on the channel's own
    median weekly pressure can sit above 1.0 when the data says so.
    """
    name = channel.name
    priors = channel.priors
    if channel.saturation is SaturationType.HILL:
        half_sat = pm.LogNormal(
            f"halfsat_{name}",
            mu=float(np.log(priors.halfsat_log_center)),
            sigma=priors.halfsat_log_sigma,
        )
        slope = pm.Gamma(f"slope_{name}", alpha=priors.hill_slope_a, beta=priors.hill_slope_b)
        return (lambda x: _pt_hill(x, half_sat, slope)), {"halfsat": half_sat, "slope": slope}

    lam = pm.HalfNormal(f"lam_{name}", sigma=priors.logistic_lam_sigma)
    return (lambda x: _pt_logistic(x, lam)), {"lam": lam}


def _validate_channel_columns(data: pd.DataFrame, config: ModelConfig) -> np.ndarray:
    """Return the (T, C) pressure matrix, refusing anything that cannot carry a parameter.

    A channel with no variation still produces a contribution and a ROAS once fitted — but
    those numbers come entirely from the prior. Reporting them as if they were measured is
    the most dangerous thing this system could do, so it is a hard error here rather than a
    warning somewhere downstream.
    """
    spend = np.column_stack([data[c.name].to_numpy(dtype=float) for c in config.channels])
    if not np.isfinite(spend).all():
        raise ValueError(
            "a channel column contains missing/non-finite values; clean it before fitting"
        )
    if np.any(spend < 0):
        bad = [c.name for i, c in enumerate(config.channels) if np.any(spend[:, i] < 0)]
        raise ValueError(
            f"channel column(s) {bad} contain negative pressure; media pressure cannot be "
            f"negative and adstock is undefined for it"
        )
    problems: list[str] = []
    for i, channel in enumerate(config.channels):
        col = spend[:, i]
        n_active = int((col > 0).sum())
        mean = float(col.mean())
        cv = float(col.std()) / mean if mean > 0 else 0.0
        if col.max() <= 0:
            problems.append(f"{channel.name!r}: no pressure at all in the window")
        elif is_effectively_constant(col):
            problems.append(
                f"{channel.name!r}: constant pressure every week, so its effect cannot be "
                f"separated from the baseline"
            )
        elif n_active < MIN_ACTIVE_WEEKS:
            problems.append(
                f"{channel.name!r}: only {n_active} active week(s), needs >= {MIN_ACTIVE_WEEKS}"
            )
        elif cv < MIN_CHANNEL_CV:
            problems.append(
                f"{channel.name!r}: coefficient of variation {cv:.3f} < {MIN_CHANNEL_CV}, "
                f"its effect cannot be separated from the baseline"
            )
    if problems:
        raise ValueError(
            "channel(s) cannot support their own parameters, so any effect reported for "
            "them would be pure prior: " + "; ".join(problems)
        )
    return spend


def build_model(data: pd.DataFrame, config: ModelConfig) -> BuiltModel:
    """Construct the PyMC model for ``config`` over the master dataset ``data``."""
    import pymc as pm
    import pytensor.tensor as pt

    for needed in (config.kpi, *config.channel_names, *config.control_columns):
        if needed not in data.columns:
            raise KeyError(f"column {needed!r} not found in the dataset")

    dates = data.index
    n = len(data)
    if n < 2:
        raise ValueError("need at least two weeks of data")

    burn_in = int(config.burn_in_weeks)
    if burn_in >= n:
        raise ValueError(
            f"burn_in_weeks ({burn_in}) leaves no observations out of {n} weeks"
        )
    n_obs = n - burn_in
    if n_obs < 2:
        raise ValueError("need at least two observed weeks after the adstock warm-up")

    kpi = data[config.kpi].to_numpy(dtype=float)
    if not np.isfinite(kpi).all():
        raise ValueError("KPI column contains missing/non-finite values; clean it first")
    is_count = config.likelihood.is_count
    if is_count:
        if np.any(kpi < 0) or np.any(kpi != np.round(kpi)):
            raise ValueError(
                "a count likelihood (poisson/negative_binomial) needs a non-negative "
                "integer KPI; use 'normal'/'student_t' for continuous KPIs"
            )
    y_max = float(kpi.max())
    if y_max <= 0:
        raise ValueError("the KPI has no positive values; there is nothing to explain")
    y_scaled = kpi / y_max  # additive link only; the count link works on raw counts

    spend = _validate_channel_columns(data, config)
    x_max = spend.max(axis=0)
    spend_scaled = spend / x_max

    # Validate & standardize controls up front — an unfilled gap here would otherwise
    # propagate NaN silently through the whole of `mu` and corrupt the fit. The training
    # mean/std are kept so out-of-sample prediction standardizes new weeks identically.
    control_scaled: dict[str, np.ndarray] = {}
    control_mean: dict[str, float] = {}
    control_std: dict[str, float] = {}
    for ctrl in config.control_columns:
        raw = data[ctrl].to_numpy(dtype=float)
        if not np.isfinite(raw).all():
            raise ValueError(
                f"control column {ctrl!r} contains missing/non-finite values; impute or "
                f"drop it before fitting (see mmm_core.features / ingestion fill options)"
            )
        mean = float(raw.mean())
        std = float(raw.std())
        if is_effectively_constant(raw):
            raise ValueError(
                f"control column {ctrl!r} is constant over the whole window; it cannot "
                f"explain any variation and only costs a parameter"
            )
        control_mean[ctrl] = mean
        control_std[ctrl] = std
        control_scaled[ctrl] = (raw - mean) / std

    t = np.arange(n, dtype=float)
    t_scaled = t / (n - 1)
    bp = config.priors

    # The intercept prior centre is the KPI level expected *without* marketing. When
    # mmm_core.model.priors resolved this config it set `intercept_mu` to (1 - media
    # share) x the median KPI, so intercept + the channels' prior effects add back up to
    # the observed level. Falling back to the plain median (as the pre-refactor model did
    # unconditionally) double-counts: the baseline alone already accounts for the whole
    # KPI before a single channel has contributed anything.
    baseline_level_scaled = (
        float(bp.intercept_mu) if bp.intercept_mu is not None else float(np.median(y_scaled))
    )

    coords = {
        "date": dates,
        "obs_date": dates[burn_in:],
        "channel": list(config.channel_names),
    }
    with pm.Model(coords=coords) as model:
        if is_count:
            # Log link: the intercept is the log baseline count.
            intercept = pm.Normal(
                "intercept",
                mu=float(np.log(max(baseline_level_scaled * y_max, 1.0))),
                sigma=1.0,
            )
        else:
            intercept = pm.Normal(
                "intercept", mu=baseline_level_scaled, sigma=bp.intercept_sigma
            )
        mu = intercept + pt.zeros(n)

        # Baseline sub-components are each registered as a per-week Deterministic so the
        # dashboard can decompose the otherwise black-box baseline into "structural level"
        # (intercept), trend, seasonality and external factors (controls). They live in the
        # same space as `mu` (scaled-KPI for the additive link, log for the count link);
        # fit.py converts them to KPI units and, for the count link, allocates them the same
        # Shapley-style way as the channel contributions so they still add up to the baseline.
        if config.add_trend:
            trend = pm.Normal("trend", mu=0.0, sigma=bp.trend_sigma)
            trend_term = trend * t_scaled
            if config.trend_type is TrendType.PIECEWISE:
                cps = changepoint_locations(config.n_changepoints)
                A = changepoint_matrix(t_scaled, cps)
                delta = pm.Laplace(
                    "trend_delta", mu=0.0, b=bp.changepoint_scale, shape=len(cps)
                )
                trend_term = trend_term + pt.dot(A, delta)
            mu = mu + pm.Deterministic("trend_effect", trend_term, dims="date")

        if config.seasonality_periods and config.n_fourier_modes > 0:
            fourier = _fourier_features(t, config.seasonality_periods, config.n_fourier_modes)
            season = pm.Normal("season", mu=0.0, sigma=bp.season_sigma, shape=fourier.shape[1])
            mu = mu + pm.Deterministic("season_effect", pt.dot(fourier, season), dims="date")

        if config.control_columns:
            controls_term = pt.zeros(n)
            for ctrl in config.control_columns:
                coef = pm.Normal(f"control_{ctrl}", mu=0.0, sigma=bp.control_sigma)
                controls_term = controls_term + coef * control_scaled[ctrl]
            mu = mu + pm.Deterministic("controls_effect", controls_term, dims="date")

        for i, channel in enumerate(config.channels):
            beta = pm.HalfNormal(f"beta_{channel.name}", sigma=channel.priors.beta_sigma)  # media cannot hurt sales
            apply_adstock, _ = _adstock_rvs(pm, channel)
            apply_saturation, _ = _saturation_rvs(pm, channel)

            x_channel = pt.as_tensor_variable(spend_scaled[:, i])
            adstocked = apply_adstock(x_channel)
            saturated = apply_saturation(adstocked)
            contribution = pm.Deterministic(
                f"contrib_{channel.name}", beta * saturated, dims="date"
            )
            mu = mu + contribution

            # Experiment calibration: nudge the channel's *implied* total ROAS toward a
            # measured value via a soft (Gaussian) penalty. Contribution is scaled KPI, so
            # multiply by y_max; spend is in original units. Only over the observed weeks,
            # so the burn-in period cannot distort the implied ROAS.
            if channel.calibration is not None:
                if is_count:
                    raise ValueError(
                        "ROAS calibration is not yet supported with a count likelihood "
                        "(the implied-ROAS penalty assumes the additive link)"
                    )
                total_spend_c = float(spend[burn_in:, i].sum())
                if total_spend_c > 0:
                    implied_roas = pt.sum(contribution[burn_in:]) * y_max / total_spend_c
                    cal = channel.calibration
                    pm.Potential(
                        f"calib_{channel.name}",
                        -0.5 * ((implied_roas - cal.roas) / cal.sd) ** 2,
                    )

        # For the additive link `mu` is the KPI on the [0,1] scaled axis; for the count
        # link it is the log-expected count. Downstream (fit/predict) branches on the same
        # config.likelihood, so this single Deterministic serves both.
        pm.Deterministic("mu", mu, dims="date")

        # Only the post-warm-up weeks enter the likelihood. The earlier weeks still shape
        # `mu` (and therefore feed later weeks' carry-over), they simply do not get to
        # claim that their artificially low adstock stock is what the data looked like.
        mu_obs = mu[burn_in:]
        if is_count:
            y_count = np.rint(kpi[burn_in:]).astype("int64")
            expected = pt.exp(mu_obs)
            if config.likelihood is LikelihoodType.POISSON:
                pm.Poisson("y", mu=expected, observed=y_count, dims="obs_date")
            else:  # negative binomial
                nb_alpha = pm.Gamma("nb_alpha", alpha=2.0, beta=0.1)  # dispersion; large -> Poisson
                pm.NegativeBinomial(
                    "y", mu=expected, alpha=nb_alpha, observed=y_count, dims="obs_date"
                )
        else:
            sigma = pm.HalfNormal("sigma", sigma=bp.noise_sigma)
            if config.likelihood is LikelihoodType.STUDENT_T:
                pm.StudentT(
                    "y", nu=config.student_t_nu, mu=mu_obs, sigma=sigma,
                    observed=y_scaled[burn_in:], dims="obs_date",
                )
            else:
                pm.Normal(
                    "y", mu=mu_obs, sigma=sigma, observed=y_scaled[burn_in:], dims="obs_date"
                )

    scalers = {
        "y_max": y_max,
        "x_max": x_max,
        "t": t,
        "n_train": n,
        "burn_in": burn_in,
        "control_mean": control_mean,
        "control_std": control_std,
    }
    return BuiltModel(
        model=model, scalers=scalers, config=config, dates=dates, spend=spend, kpi=kpi
    )
