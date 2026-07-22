"""Reconstruct KPI predictions from a fitted posterior for any aligned week range.

The fit itself only produces ``mu`` over the training weeks. To evaluate the model
*out of sample* (cross-validation) or to forecast a *what-if* spend plan, we need to
apply the fitted structure to weeks the model did not see. This module does exactly
that, in numpy, mirroring :mod:`mmm_core.model.build` component-for-component so the
in-sample reconstruction reproduces the model's own ``mu`` (a pinned test).

It is deliberately pure numpy over posterior sample arrays — no PyTensor — so predicting
is cheap and needs no re-sampling. Adstock is applied over the *whole* supplied history
so carry-over into later weeks is correct; standardization of controls and the trend's
time-scaling reuse the *training* scalers, so no test-period information leaks in.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from mmm_core.model.build import (
    BuiltModel,
    _HILL_EPS,
    _fourier_features,
    changepoint_locations,
    changepoint_matrix,
)
from mmm_core.model.config import AdstockType, SaturationType, TrendType
from mmm_core.transforms import (
    delayed_adstock,
    geometric_adstock,
    hill_saturation,
    logistic_saturation,
)


def _flat(idata, name: str) -> np.ndarray:
    return idata.posterior[name].stack(sample=("chain", "draw")).to_numpy()


def _channel_contribution(ch, spend_scaled_col, alpha, theta, sat_params, beta, l_max):
    """Steady per-week contribution samples ``(T, S)`` for one channel (scaled KPI units)."""
    T = spend_scaled_col.shape[0]
    S = alpha.shape[0]
    x_rep = np.tile(spend_scaled_col[:, None], (1, S))       # (T, S)
    if ch.adstock is AdstockType.DELAYED:
        adstocked = delayed_adstock(x_rep, alpha=alpha, theta=theta, l_max=l_max)
    else:
        adstocked = geometric_adstock(x_rep, alpha=alpha, l_max=l_max)
    if ch.saturation is SaturationType.HILL:
        # mirror the model's tiny gradient-stability pedestal for an exact match
        saturated = hill_saturation(adstocked + _HILL_EPS, sat_params["halfsat"], sat_params["slope"])
    else:
        saturated = logistic_saturation(adstocked + _HILL_EPS, sat_params["lam"])
    return beta[None, :] * saturated                         # (T, S)


def posterior_predict(built: BuiltModel, idata, data: pd.DataFrame) -> dict:
    """Predict KPI for ``data`` from the fitted posterior.

    ``data`` must be a weekly frame that starts on the same week as training (so the
    absolute time index lines up) and carries the model's channel and control columns.
    It may be longer than the training window (a forecast) or equal to it (in-sample).

    Returns a dict with:
        ``kpi`` — ``(T, S)`` posterior KPI predictions in original units,
        ``kpi_mean`` — ``(T,)`` posterior-mean prediction,
        ``components`` — ``{"baseline": (T,S), channel_name: (T,S), ...}`` (scaled KPI),
        ``dates`` — the prediction index.
    """
    config = built.config
    y_max = float(built.scalers["y_max"])
    x_max = np.asarray(built.scalers["x_max"], dtype=float)
    n_train = int(built.scalers["n_train"])
    control_mean = built.scalers["control_mean"]
    control_std = built.scalers["control_std"]

    if data.index[0] != built.dates[0]:
        raise ValueError("prediction frame must start on the same week as the training data")

    n = len(data)
    t = np.arange(n, dtype=float)
    t_scaled = t / (n_train - 1)                             # same scaling as training

    intercept = _flat(idata, "intercept")                   # (S,)
    S = intercept.shape[0]
    baseline = np.tile(intercept[None, :], (n, 1))          # (T, S)

    if config.add_trend:
        trend = _flat(idata, "trend")
        baseline = baseline + np.outer(t_scaled, trend)
        if config.trend_type is TrendType.PIECEWISE:
            A = changepoint_matrix(t_scaled, changepoint_locations(config.n_changepoints))
            delta = _flat(idata, "trend_delta")            # (n_cp, S)
            baseline = baseline + np.einsum("tj,js->ts", A, delta)

    if config.seasonality_periods and config.n_fourier_modes > 0:
        fourier = _fourier_features(t, config.seasonality_periods, config.n_fourier_modes)
        season = _flat(idata, "season")                     # (n_fourier, S)
        baseline = baseline + np.einsum("tk,ks->ts", fourier, season)

    for ctrl in config.control_columns:
        raw = data[ctrl].to_numpy(dtype=float)
        ctrl_scaled = (raw - control_mean[ctrl]) / control_std[ctrl]
        coef = _flat(idata, f"control_{ctrl}")
        baseline = baseline + np.outer(ctrl_scaled, coef)

    components: dict[str, np.ndarray] = {"baseline": baseline}
    mu = baseline.copy()
    for i, ch in enumerate(config.channels):
        spend_scaled_col = data[ch.name].to_numpy(dtype=float) / x_max[i]
        alpha = _flat(idata, f"alpha_{ch.name}")
        theta = _flat(idata, f"theta_{ch.name}") if ch.adstock is AdstockType.DELAYED else None
        if ch.saturation is SaturationType.HILL:
            sat_params = {"halfsat": _flat(idata, f"halfsat_{ch.name}"), "slope": _flat(idata, f"slope_{ch.name}")}
        else:
            sat_params = {"lam": _flat(idata, f"lam_{ch.name}")}
        beta = _flat(idata, f"beta_{ch.name}")
        contrib = _channel_contribution(ch, spend_scaled_col, alpha, theta, sat_params, beta, ch.l_max)
        components[ch.name] = contrib
        mu = mu + contrib

    # Additive link: KPI = mu * y_max. Count (log) link: KPI = exp(mu).
    kpi = np.exp(mu) if config.likelihood.is_count else mu * y_max
    return {"kpi": kpi, "kpi_mean": kpi.mean(axis=1), "components": components, "dates": data.index}
