"""Sanity checks every model output must pass before we trust it.

The build plan's rule: validate each result before believing it. Two checks are
model-agnostic and belong here as pure functions:

  1. **Decomposition adds up** — the baseline plus every channel's contribution must
     reconstruct the fitted KPI (up to noise/rounding).
  2. **Interval coverage** — the fraction of actual points falling inside their credible
     interval should roughly match the interval's nominal level; if a "90% interval"
     only covers 60% of points, the uncertainty itself is untrustworthy.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    detail: str
    value: float


def decomposition_residual(total: np.ndarray, components: dict[str, np.ndarray]) -> np.ndarray:
    """Return ``total - sum(components)`` elementwise."""
    total = np.asarray(total, dtype=float)
    stacked = np.sum([np.asarray(c, dtype=float) for c in components.values()], axis=0)
    return total - stacked


def check_decomposition_adds_up(
    total: np.ndarray,
    components: dict[str, np.ndarray],
    *,
    rtol: float = 1e-3,
) -> CheckResult:
    """Check that the components reconstruct the total within a relative tolerance."""
    resid = decomposition_residual(total, components)
    scale = float(np.mean(np.abs(np.asarray(total, dtype=float)))) or 1.0
    rel = float(np.max(np.abs(resid))) / scale
    ok = rel <= rtol
    return CheckResult(
        ok=ok,
        detail=f"max relative decomposition residual {rel:.2e} (tol {rtol:.1e})",
        value=rel,
    )


def interval_coverage(
    actual: np.ndarray, lower: np.ndarray, upper: np.ndarray
) -> float:
    """Fraction of ``actual`` values lying within ``[lower, upper]`` (inclusive)."""
    actual = np.asarray(actual, dtype=float)
    lower = np.asarray(lower, dtype=float)
    upper = np.asarray(upper, dtype=float)
    if not (actual.shape == lower.shape == upper.shape):
        raise ValueError("actual, lower and upper must share the same shape")
    inside = (actual >= lower) & (actual <= upper)
    return float(np.mean(inside))


def check_interval_coverage(
    actual: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
    *,
    nominal: float = 0.9,
    tolerance: float = 0.1,
) -> CheckResult:
    """Check that empirical coverage is within ``tolerance`` of the nominal level."""
    cov = interval_coverage(actual, lower, upper)
    ok = abs(cov - nominal) <= tolerance
    return CheckResult(
        ok=ok,
        detail=f"empirical coverage {cov:.2%} vs nominal {nominal:.0%} (±{tolerance:.0%})",
        value=cov,
    )
