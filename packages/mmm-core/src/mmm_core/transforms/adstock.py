"""Geometric adstock: the carry-over of advertising effect across weeks.

A euro spent this week keeps working in later weeks with a geometrically decaying
weight ``alpha**lag``. Channels that capture existing intent (search, marketplaces)
decay fast (short half-life); brand/prospecting channels linger (long half-life).

We use a fixed maximum lag ``l_max`` and, by default, *normalized* weights so the
transform redistributes mass in time without inflating the total — that keeps the
channel coefficient in the model interpretable as an effect size rather than being
entangled with the adstock's summation gain.
"""

from __future__ import annotations

import math

import numpy as np

__all__ = [
    "geometric_adstock",
    "adstock_weights",
    "alpha_from_half_life",
    "half_life_from_alpha",
    "delayed_adstock",
    "delayed_adstock_weights",
]


def alpha_from_half_life(half_life: float) -> float:
    """Retention rate ``alpha`` such that the effect halves after ``half_life`` weeks."""
    if half_life <= 0:
        raise ValueError("half_life must be > 0")
    return float(0.5 ** (1.0 / half_life))


def half_life_from_alpha(alpha: float) -> float:
    """Weeks until the carried-over effect halves, given retention rate ``alpha``."""
    if not 0.0 < alpha < 1.0:
        raise ValueError("half_life is only defined for 0 < alpha < 1")
    return float(math.log(0.5) / math.log(alpha))


def adstock_weights(alpha: float, l_max: int, normalize: bool = True) -> np.ndarray:
    """The lag-weight vector ``[1, alpha, alpha**2, ...]`` (optionally normalized)."""
    if l_max < 1:
        raise ValueError("l_max must be >= 1")
    if not 0.0 <= alpha < 1.0:
        raise ValueError("alpha must be in [0, 1)")
    w = alpha ** np.arange(l_max, dtype=float)
    if normalize:
        w = w / w.sum()
    return w


def geometric_adstock(
    x: np.ndarray,
    alpha: float | np.ndarray,
    l_max: int = 12,
    normalize: bool = True,
) -> np.ndarray:
    """Apply geometric adstock along the time axis.

    Args:
        x: Spend series. Either 1-D ``(T,)`` or 2-D ``(T, n_channels)`` with time first.
        alpha: Retention rate in ``[0, 1)``. Scalar, or one per channel for 2-D input.
        l_max: Maximum carry-over lag in weeks.
        normalize: If True, weights sum to 1 so the transform preserves the total mass
            (interior of the series); if False it applies the raw geometric weights,
            which increases the total by the geometric-series gain.

    Returns:
        The adstocked series, same shape as ``x``. The transform is strictly causal:
        ``y[t]`` depends only on ``x[t], x[t-1], ...``.
    """
    x = np.asarray(x, dtype=float)
    if x.ndim not in (1, 2):
        raise ValueError("x must be 1-D (T,) or 2-D (T, n_channels)")
    single = x.ndim == 1
    X = x[:, None] if single else x
    T, C = X.shape

    alphas = np.broadcast_to(np.asarray(alpha, dtype=float), (C,))
    if np.any((alphas < 0.0) | (alphas >= 1.0)):
        raise ValueError("alpha must be in [0, 1)")
    if l_max < 1:
        raise ValueError("l_max must be >= 1")

    lags = np.arange(l_max, dtype=float)[:, None]        # (l_max, 1)
    W = alphas[None, :] ** lags                          # (l_max, C)
    if normalize:
        W = W / W.sum(axis=0, keepdims=True)

    Y = np.zeros_like(X)
    for lag in range(min(l_max, T)):
        Y[lag:] += W[lag][None, :] * X[: T - lag]

    return Y[:, 0] if single else Y


def delayed_adstock_weights(
    alpha: float, theta: float, l_max: int, normalize: bool = True
) -> np.ndarray:
    """Delayed-adstock lag weights ``alpha ** ((lag - theta) ** 2)``.

    Unlike geometric adstock (which peaks immediately at lag 0 and decays), this peaks
    ``theta`` weeks *after* the spend and decays on either side — the shape offline
    channels like TV/radio/OOH typically show, where the effect builds before it fades.
    ``theta = 0`` recovers a fast-peaking curve; larger ``theta`` pushes the peak later.

    Args:
        alpha: Retention/decay in ``(0, 1)``; higher = slower decay away from the peak.
        theta: Peak lag in weeks (``>= 0``).
        l_max: Number of lag weights.
        normalize: If True, weights sum to 1 (mass-preserving, like ``adstock_weights``).
    """
    if not 0.0 < alpha < 1.0:
        raise ValueError("alpha must be in (0, 1)")
    if theta < 0:
        raise ValueError("theta must be >= 0")
    if l_max < 1:
        raise ValueError("l_max must be >= 1")
    lags = np.arange(l_max, dtype=float)
    w = alpha ** ((lags - theta) ** 2)
    if normalize:
        w = w / w.sum()
    return w


def delayed_adstock(
    x: np.ndarray,
    alpha: float | np.ndarray,
    theta: float | np.ndarray,
    l_max: int = 12,
    normalize: bool = True,
) -> np.ndarray:
    """Apply delayed (peaked) adstock along the time axis; see :func:`delayed_adstock_weights`.

    Args:
        x: Spend series, 1-D ``(T,)`` or 2-D ``(T, n_channels)`` with time first.
        alpha: Retention in ``(0, 1)``. Scalar or one per channel.
        theta: Peak lag in weeks (``>= 0``). Scalar or one per channel.
        l_max: Maximum carry-over lag in weeks.
        normalize: If True, weights sum to 1.

    Returns:
        The adstocked series, same shape as ``x``. Strictly causal.
    """
    x = np.asarray(x, dtype=float)
    if x.ndim not in (1, 2):
        raise ValueError("x must be 1-D (T,) or 2-D (T, n_channels)")
    single = x.ndim == 1
    X = x[:, None] if single else x
    T, C = X.shape

    alphas = np.broadcast_to(np.asarray(alpha, dtype=float), (C,))
    thetas = np.broadcast_to(np.asarray(theta, dtype=float), (C,))
    if np.any((alphas <= 0.0) | (alphas >= 1.0)):
        raise ValueError("alpha must be in (0, 1)")
    if np.any(thetas < 0.0):
        raise ValueError("theta must be >= 0")
    if l_max < 1:
        raise ValueError("l_max must be >= 1")

    lags = np.arange(l_max, dtype=float)[:, None]            # (l_max, 1)
    W = alphas[None, :] ** ((lags - thetas[None, :]) ** 2)   # (l_max, C)
    if normalize:
        W = W / W.sum(axis=0, keepdims=True)

    Y = np.zeros_like(X)
    for lag in range(min(l_max, T)):
        Y[lag:] += W[lag][None, :] * X[: T - lag]

    return Y[:, 0] if single else Y
