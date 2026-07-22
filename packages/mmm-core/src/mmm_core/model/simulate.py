"""Synthetic MMM data with known ground truth.

The build plan is explicit: prove the statistical core against a dataset whose answer
we already know. This module generates spend + KPI from a fully specified
data-generating process (DGP) and returns both the observable data *and* the true
contributions/ROAS, so a fitted model can be scored against ground truth rather than
against itself.

The DGP mirrors the model we intend to fit:

    contribution_c(t) = beta_c * hill( adstock(spend_c) )
    KPI(t) = baseline + trend + seasonality + sum_c contribution_c(t) + noise
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from mmm_core.transforms import (
    alpha_from_half_life,
    geometric_adstock,
    hill_saturation,
)


@dataclass(frozen=True)
class TrueChannel:
    """Ground-truth parameters and outcomes for one simulated channel."""

    name: str
    half_life: float
    half_saturation: float
    slope: float
    beta: float
    total_spend: float
    total_contribution: float

    @property
    def roas(self) -> float:
        return self.total_contribution / self.total_spend if self.total_spend else float("nan")


@dataclass(frozen=True)
class SimulatedDataset:
    data: pd.DataFrame                 # week_start index; columns: kpi + one per channel
    kpi_column: str
    channels: tuple[TrueChannel, ...]
    baseline_total: float              # total KPI from intercept+trend+seasonality
    noise_sd: float
    contributions: pd.DataFrame = field(repr=False)  # per-week true contribution per channel

    @property
    def channel_names(self) -> list[str]:
        return [c.name for c in self.channels]

    def true_contribution_share(self) -> dict[str, float]:
        total = self.data[self.kpi_column].sum()
        return {c.name: c.total_contribution / total for c in self.channels}


@dataclass(frozen=True)
class ChannelDGP:
    """Specification of one channel in the data-generating process."""

    name: str
    half_life: float
    half_saturation: float
    beta: float
    slope: float = 1.0
    spend_base: float = 100.0
    spend_burstiness: float = 0.6  # 0 = flat spend, 1 = very bursty campaigns


def _simulate_spend(spec: ChannelDGP, n_weeks: int, rng: np.random.Generator) -> np.ndarray:
    """Positive, mildly bursty weekly spend for one channel."""
    # AR(1)-ish log spend with occasional campaign bursts.
    noise = rng.normal(0, spec.spend_burstiness, n_weeks)
    log_spend = np.log(spec.spend_base) + np.cumsum(noise) * 0.15
    bursts = (rng.random(n_weeks) < 0.1) * rng.uniform(0.3, 1.0, n_weeks)
    spend = np.exp(log_spend) * (1.0 + bursts)
    return np.maximum(spend, 0.0)


def simulate_mmm(
    channels: list[ChannelDGP],
    *,
    n_weeks: int = 104,
    intercept: float = 5000.0,
    trend_per_week: float = 5.0,
    seasonal_amplitude: float = 300.0,
    noise_sd: float = 150.0,
    start: str = "2022-01-03",
    seed: int = 0,
) -> SimulatedDataset:
    """Generate a synthetic weekly MMM dataset with known ground truth.

    Returns a :class:`SimulatedDataset` whose ``data`` is what a builder would upload,
    and whose ``channels`` carry the true half-life/saturation/beta and the exact
    contribution and ROAS each channel produced.
    """
    if not channels:
        raise ValueError("need at least one channel")
    rng = np.random.default_rng(seed)
    index = pd.date_range(start, periods=n_weeks, freq="7D", name="week_start")
    t = np.arange(n_weeks)

    baseline = intercept + trend_per_week * t
    if seasonal_amplitude:
        baseline = baseline + seasonal_amplitude * np.sin(2 * np.pi * t / 52.0)

    kpi = baseline.astype(float).copy()
    spends: dict[str, np.ndarray] = {}
    contributions: dict[str, np.ndarray] = {}
    truths: list[TrueChannel] = []

    for spec in channels:
        spend = _simulate_spend(spec, n_weeks, rng)
        alpha = alpha_from_half_life(spec.half_life)
        adstocked = geometric_adstock(spend, alpha=alpha, l_max=12, normalize=True)
        saturated = hill_saturation(adstocked, spec.half_saturation, spec.slope)
        contribution = spec.beta * saturated

        spends[spec.name] = spend
        contributions[spec.name] = contribution
        kpi = kpi + contribution
        truths.append(
            TrueChannel(
                name=spec.name,
                half_life=spec.half_life,
                half_saturation=spec.half_saturation,
                slope=spec.slope,
                beta=spec.beta,
                total_spend=float(spend.sum()),
                total_contribution=float(contribution.sum()),
            )
        )

    kpi = kpi + rng.normal(0, noise_sd, n_weeks)

    frame = pd.DataFrame({"kpi": kpi, **spends}, index=index)
    contrib_frame = pd.DataFrame(contributions, index=index)
    return SimulatedDataset(
        data=frame,
        kpi_column="kpi",
        channels=tuple(truths),
        baseline_total=float(baseline.sum()),
        noise_sd=noise_sd,
        contributions=contrib_frame,
    )
