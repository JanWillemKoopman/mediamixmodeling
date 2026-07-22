"""Saturation curves: the diminishing returns of media pressure.

Every saturation maps (adstocked) spend to a bounded response shape in ``[0, 1)``; the
model multiplies that shape by a channel coefficient (the ceiling / max effect). Keeping
shape and scale separate is what makes the fitted parameters interpretable.

Two families are provided, both common in the MMM literature:

- **Hill** ``f(x) = x**s / (kappa**s + x**s)`` — ``kappa`` (half-saturation) is the
  spend at which the channel reaches half its ceiling (``f(kappa)=0.5``), a natural
  "saturation point" read-out; ``s`` controls curvature (``s<=1`` concave from the
  origin, ``s>1`` an S-curve).
- **Logistic** ``f(x) = (1 - exp(-lam*x)) / (1 + exp(-lam*x))`` — a single steepness
  ``lam``; concave from the origin, saturating smoothly. Fewer parameters than Hill,
  which makes it robust when data is thin.
"""

from __future__ import annotations

import numpy as np

__all__ = ["hill_saturation", "logistic_saturation", "saturation_half_point"]


def hill_saturation(
    x: np.ndarray,
    half_saturation: float | np.ndarray,
    slope: float | np.ndarray = 1.0,
) -> np.ndarray:
    """Apply Hill saturation elementwise.

    Args:
        x: Non-negative (adstocked) spend. Any shape; for 2-D ``(T, n_channels)`` input
            ``half_saturation``/``slope`` may be scalars or per-channel vectors.
        half_saturation: Spend at which the response is half its ceiling. Must be > 0.
        slope: Hill shape parameter. Must be > 0.

    Returns:
        Response in ``[0, 1)``, same shape as ``x``.
    """
    x = np.asarray(x, dtype=float)
    if np.any(x < 0.0):
        raise ValueError("hill_saturation expects non-negative spend")
    k = np.asarray(half_saturation, dtype=float)
    s = np.asarray(slope, dtype=float)
    if np.any(k <= 0.0):
        raise ValueError("half_saturation must be > 0")
    if np.any(s <= 0.0):
        raise ValueError("slope must be > 0")

    xs = np.power(x, s)
    ks = np.power(k, s)
    return xs / (ks + xs)


def logistic_saturation(
    x: np.ndarray, lam: float | np.ndarray = 1.0
) -> np.ndarray:
    """Apply logistic saturation elementwise: ``(1 - e^{-lam x}) / (1 + e^{-lam x})``.

    Args:
        x: Non-negative (adstocked) spend, any shape.
        lam: Steepness (> 0); larger saturates sooner. Scalar or per-channel vector.

    Returns:
        Response in ``[0, 1)``, same shape as ``x``.
    """
    x = np.asarray(x, dtype=float)
    if np.any(x < 0.0):
        raise ValueError("logistic_saturation expects non-negative spend")
    lam_ = np.asarray(lam, dtype=float)
    if np.any(lam_ <= 0.0):
        raise ValueError("lam must be > 0")
    e = np.exp(-lam_ * x)
    return (1.0 - e) / (1.0 + e)


def saturation_half_point(
    saturation: str, params: dict[str, float]
) -> float:
    """Spend at which a saturation reaches half its ceiling — a comparable "saturation
    point" across curve families (for Hill it is ``kappa`` exactly; for logistic it is
    ``ln(3)/lam``, where ``f = 0.5``).

    Args:
        saturation: ``"hill"`` or ``"logistic"``.
        params: ``{"half_saturation": ...}`` for Hill, ``{"lam": ...}`` for logistic.
    """
    if saturation == "hill":
        return float(params["half_saturation"])
    if saturation == "logistic":
        return float(np.log(3.0) / params["lam"])
    raise ValueError(f"unknown saturation {saturation!r}")
