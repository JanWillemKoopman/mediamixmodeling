"""Measured facts about one master dataset, in the model's own scaled space.

Priors are statements about *scale*, so they can only be set once you know the scale of
the thing you are modelling. This module does that measuring, deterministically and
cheaply (ordinary least squares, no sampling), and hands the numbers to
:mod:`mmm_core.model.priors`.

Everything is reported in the same scaled space the model fits in — the KPI divided by
its maximum, each channel divided by its own maximum — so a prior derived from these
numbers is directly usable as a prior on the model's parameters, with no unit conversion
in between and therefore no place for a factor-of-1000 mistake to hide.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# Below this coefficient of variation a channel carries essentially no usable signal: its
# effect cannot be separated from the intercept, so the model would report a number that
# is entirely prior.
MIN_CHANNEL_CV = 0.05
# A channel needs at least this many weeks with non-zero pressure before its shape
# (carry-over + saturation, 3-4 parameters) is estimable at all.
MIN_ACTIVE_WEEKS = 8


def is_effectively_constant(values: np.ndarray) -> bool:
    """True when a column carries no usable variation.

    An exact ``std == 0`` test is not enough: a column literally filled with the same
    float still comes back with a standard deviation around 1e-15 from the summation, so
    a strict comparison lets a constant column through and it then costs a parameter that
    can never be identified. Compare against the column's own magnitude instead.
    """
    values = np.asarray(values, dtype=float)
    if values.size == 0:
        return True
    scale = max(abs(float(values.mean())), 1.0)
    return float(values.std()) <= 1e-9 * scale


def _fourier_matrix(n: int, period: float, n_modes: int) -> np.ndarray:
    t = np.arange(n, dtype=float)
    cols = []
    for k in range(1, n_modes + 1):
        cols.append(np.sin(2 * np.pi * k * t / period))
        cols.append(np.cos(2 * np.pi * k * t / period))
    return np.column_stack(cols)


def _ols(design: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Least-squares coefficients and residuals; never raises on a rank-deficient design."""
    coef, *_ = np.linalg.lstsq(design, y, rcond=None)
    return coef, y - design @ coef


@dataclass(frozen=True)
class ChannelStatistics:
    """Measured scale of one channel's weekly pressure.

    ``*_scaled`` values are divided by ``max_weekly`` (the model's own scaler), so
    ``median_scaled`` is where the typical week sits on the 0-1 axis the saturation curve
    is defined on. That is exactly the quantity a half-saturation prior has to be centred
    on.
    """

    name: str
    max_weekly: float
    median_weekly: float
    active_median_weekly: float
    mean_weekly: float
    std_weekly: float
    total: float
    n_active_weeks: int
    n_weeks: int

    @property
    def median_scaled(self) -> float:
        """Typical weekly pressure on the 0-1 axis, measured over the weeks it ran.

        Deliberately the *active* median, not the median over every week. A flighted
        channel — tv in bursts, radio in campaigns — is off more often than it is on, so
        its plain median is 0 and every prior derived from it collapses: the
        half-saturation point lands at zero, which says the channel is fully saturated at
        any spend at all. The curve goes flat, the data can no longer move it, and the
        channel comes out unidentifiable with a contribution that is pure prior.

        The pressure a saturation curve has to be centred on is the pressure during a
        flight. A channel that is off half the year still saturates at its on-air level.
        """
        if self.max_weekly <= 0:
            return 0.0
        typical = self.active_median_weekly if self.n_active_weeks > 0 else self.median_weekly
        return typical / self.max_weekly

    @property
    def cv(self) -> float:
        """Coefficient of variation - how much week-to-week signal there is to learn from."""
        return self.std_weekly / self.mean_weekly if self.mean_weekly > 0 else 0.0

    @property
    def is_degenerate(self) -> bool:
        """True when this channel cannot support its own parameters.

        Fitting it anyway produces a contribution and a ROAS that come entirely from the
        prior — a number that looks like a measurement but is not one.
        """
        return (
            self.max_weekly <= 0
            or self.n_active_weeks < MIN_ACTIVE_WEEKS
            or self.cv < MIN_CHANNEL_CV
        )

    def degenerate_reason(self) -> str | None:
        if self.max_weekly <= 0:
            return "geen enkele week met uitgaven/druk in de analyseperiode"
        if self.n_active_weeks < MIN_ACTIVE_WEEKS:
            return (
                f"maar {self.n_active_weeks} actieve week(en) (minimaal {MIN_ACTIVE_WEEKS} "
                f"nodig om na-ijl en verzadiging te kunnen schatten)"
            )
        if self.cv < MIN_CHANNEL_CV:
            return (
                f"vrijwel geen variatie van week tot week (variatiecoëfficiënt "
                f"{self.cv:.3f} < {MIN_CHANNEL_CV}); zonder variatie is het effect niet "
                f"te scheiden van de basislijn"
            )
        return None


@dataclass(frozen=True)
class DatasetStatistics:
    """Everything :mod:`mmm_core.model.priors` needs to know about a dataset.

    Attributes:
        n_weeks: Rows in the master table.
        kpi_max: The KPI scaler (the model divides by this).
        kpi_median_scaled: Median KPI on the 0-1 axis - the level the intercept prior is
            split around.
        kpi_std_scaled: Week-to-week spread of the KPI, scaled.
        kpi_is_integer: Whether every KPI value is a whole number.
        kpi_median_raw: Median in original units (used to pick a count likelihood).
        n_zero_kpi_weeks: Weeks where the KPI is exactly 0.
        seasonal_amplitude_scaled: RMS of the fitted Fourier coefficients on the detrended
            KPI. This is the *measured* seasonal swing and the only defensible basis for a
            seasonality prior.
        trend_slope_scaled: OLS slope of the KPI over scaled time (0-1 across the window).
        residual_sd_scaled: Residual spread after regressing the KPI on trend, season,
            controls and raw channel pressure - an upper bound on how much noise the
            observation model needs to absorb.
        residual_excess_kurtosis: Excess kurtosis of those residuals. Above ~1 the KPI has
            heavier tails than a Gaussian (occasional extreme weeks), which is what a
            Student-T likelihood is for; below it a Normal is the honest choice.
        channels: Per-channel measurements.
        control_std: Raw standard deviation per control column (0 means constant).
    """

    n_weeks: int
    kpi_max: float
    kpi_median_scaled: float
    kpi_std_scaled: float
    kpi_is_integer: bool
    kpi_median_raw: float
    n_zero_kpi_weeks: int
    seasonal_amplitude_scaled: float
    trend_slope_scaled: float
    residual_sd_scaled: float
    residual_excess_kurtosis: float
    channels: tuple[ChannelStatistics, ...]
    control_std: dict[str, float]

    def channel(self, name: str) -> ChannelStatistics:
        for c in self.channels:
            if c.name == name:
                return c
        raise KeyError(f"no statistics for channel {name!r}")

    def degenerate_channels(self) -> list[tuple[str, str]]:
        """``(name, reason)`` for every channel that cannot support its own parameters."""
        out = []
        for c in self.channels:
            reason = c.degenerate_reason()
            if reason is not None:
                out.append((c.name, reason))
        return out


def measure_dataset(
    data: pd.DataFrame,
    kpi: str,
    channel_names: list[str],
    control_columns: list[str] | tuple[str, ...] = (),
    *,
    seasonality_periods: float | None = 52.0,
    n_fourier_modes: int = 2,
) -> DatasetStatistics:
    """Measure a master table for prior construction.

    Pure numpy/pandas; no PyMC, no sampling, so this is cheap enough to run on every
    configuration attempt — including server-side, before a job is ever queued.
    """
    missing = [c for c in [kpi, *channel_names, *control_columns] if c not in data.columns]
    if missing:
        raise KeyError(f"column(s) {missing} not found in the dataset")

    n = len(data)
    if n < 2:
        raise ValueError("need at least two weeks of data to measure a dataset")

    kpi_raw = data[kpi].to_numpy(dtype=float)
    finite = np.isfinite(kpi_raw)
    if not finite.all():
        raise ValueError(f"KPI column {kpi!r} contains missing/non-finite values")
    kpi_max = float(np.max(kpi_raw))
    if kpi_max <= 0:
        raise ValueError(
            f"KPI column {kpi!r} has no positive values; an MMM needs a KPI that is at "
            f"least sometimes above zero"
        )
    y = kpi_raw / kpi_max

    # --- trend (OLS on scaled time) ---
    t_scaled = np.arange(n, dtype=float) / (n - 1)
    trend_design = np.column_stack([np.ones(n), t_scaled])
    trend_coef, detrended = _ols(trend_design, y)
    trend_slope = float(trend_coef[1])

    # --- seasonality: fit the Fourier basis on the DETRENDED KPI ---
    # Measuring on the raw series would let a rising trend masquerade as a half-cycle of
    # seasonality and inflate the seasonal prior.
    seasonal_amplitude = 0.0
    if seasonality_periods and n_fourier_modes > 0 and n >= 2 * (2 * n_fourier_modes) + 2:
        fourier = _fourier_matrix(n, float(seasonality_periods), n_fourier_modes)
        season_coef, _ = _ols(np.column_stack([np.ones(n), fourier]), detrended)
        seasonal_amplitude = float(np.sqrt(np.mean(season_coef[1:] ** 2)))

    # --- channels ---
    channels: list[ChannelStatistics] = []
    for name in channel_names:
        raw = data[name].to_numpy(dtype=float)
        if not np.isfinite(raw).all():
            raise ValueError(f"channel column {name!r} contains missing/non-finite values")
        if np.any(raw < 0):
            raise ValueError(
                f"channel column {name!r} has negative values; media pressure cannot be "
                f"negative and adstock is undefined for it"
            )
        active = raw > 0
        channels.append(
            ChannelStatistics(
                name=name,
                max_weekly=float(raw.max()),
                median_weekly=float(np.median(raw)),
                active_median_weekly=float(np.median(raw[active])) if active.any() else 0.0,
                mean_weekly=float(raw.mean()),
                std_weekly=float(raw.std()),
                total=float(raw.sum()),
                n_active_weeks=int(active.sum()),
                n_weeks=n,
            )
        )

    # --- controls ---
    control_std: dict[str, float] = {}
    control_cols: list[np.ndarray] = []
    for ctrl in control_columns:
        raw = data[ctrl].to_numpy(dtype=float)
        if not np.isfinite(raw).all():
            raise ValueError(f"control column {ctrl!r} contains missing/non-finite values")
        sd = 0.0 if is_effectively_constant(raw) else float(raw.std())
        control_std[ctrl] = sd
        if sd > 0:
            control_cols.append((raw - raw.mean()) / sd)

    # --- residual spread after everything linear we can cheaply account for ---
    design_parts: list[np.ndarray] = [np.ones(n), t_scaled]
    if seasonality_periods and n_fourier_modes > 0 and n >= 2 * (2 * n_fourier_modes) + 2:
        design_parts.append(_fourier_matrix(n, float(seasonality_periods), n_fourier_modes))
    for col in control_cols:
        design_parts.append(col)
    for c in channels:
        if c.max_weekly > 0:
            design_parts.append(data[c.name].to_numpy(dtype=float) / c.max_weekly)
    design = np.column_stack([p if p.ndim == 2 else p[:, None] for p in design_parts])
    # Only trust the residual spread when the design is not close to saturating the data.
    if n > design.shape[1] + 2:
        _, resid = _ols(design, y)
        dof = max(n - design.shape[1], 1)
        residual_sd = float(np.sqrt(np.sum(resid**2) / dof))
    else:
        resid = y - float(np.mean(y))
        residual_sd = float(np.std(y))
    excess_kurtosis = 0.0
    if residual_sd > 0 and n >= 8:
        z = (resid - resid.mean()) / residual_sd
        excess_kurtosis = float(np.mean(z**4) - 3.0)

    return DatasetStatistics(
        n_weeks=n,
        kpi_max=kpi_max,
        kpi_median_scaled=float(np.median(y)),
        kpi_std_scaled=float(np.std(y)),
        kpi_is_integer=bool(np.all(kpi_raw == np.round(kpi_raw))),
        kpi_median_raw=float(np.median(kpi_raw)),
        n_zero_kpi_weeks=int(np.sum(kpi_raw == 0)),
        seasonal_amplitude_scaled=seasonal_amplitude,
        trend_slope_scaled=trend_slope,
        residual_sd_scaled=residual_sd,
        residual_excess_kurtosis=excess_kurtosis,
        channels=tuple(channels),
        control_std=control_std,
    )
