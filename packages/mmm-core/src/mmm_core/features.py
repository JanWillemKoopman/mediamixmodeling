"""Feature engineering & cleaning helpers for the master dataset.

These are the "prep" tools a builder (or the architect) reaches for *after* ingestion has
aligned the sources into one weekly table, but *before* fitting: extra explanatory
columns (calendar events, additional seasonal cycles, lags) and cleaning operations
(fill gaps, tame outliers) on control columns. Everything here is pure numpy/pandas over
the weekly (Monday-indexed) master frame — no PyMC — so it is fast to test and cheap to run.

A column produced here is typically added to ``ModelConfig.control_columns`` so it enters
the model linearly, exactly like any other control.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd

from mmm_core.ingestion.dates import to_week_start

__all__ = [
    "fourier_seasonality",
    "recurring_week_dummy",
    "date_span_dummy",
    "lagged_feature",
    "rolling_mean",
    "zscore",
    "log1p_feature",
    "fill_missing",
    "flag_outliers",
    "flag_local_outliers",
    "winsorize",
]

_FILL_STRATEGIES = ("zero", "ffill", "bfill", "interpolate", "mean", "median")


def fourier_seasonality(
    index: pd.DatetimeIndex, period_weeks: float, n_modes: int, prefix: str = "season"
) -> pd.DataFrame:
    """Sin/cos Fourier features for a seasonal cycle of ``period_weeks``.

    The model already fits a yearly (52-week) cycle internally; use this to add a
    *second* cycle (e.g. a ~13-week quarterly or a payday rhythm) as control columns.

    Returns a DataFrame with ``2 * n_modes`` columns, indexed like ``index``.
    """
    if n_modes < 1:
        raise ValueError("n_modes must be >= 1")
    if period_weeks <= 0:
        raise ValueError("period_weeks must be > 0")
    t = np.arange(len(index), dtype=float)
    cols: dict[str, np.ndarray] = {}
    for k in range(1, n_modes + 1):
        cols[f"{prefix}_sin{k}"] = np.sin(2 * np.pi * k * t / period_weeks)
        cols[f"{prefix}_cos{k}"] = np.cos(2 * np.pi * k * t / period_weeks)
    return pd.DataFrame(cols, index=index)


def recurring_week_dummy(
    index: pd.DatetimeIndex, iso_weeks: Iterable[int], name: str = "event"
) -> pd.Series:
    """A 0/1 column that is 1 on the given ISO week numbers *in every year*.

    Use for recurring calendar effects — Black Friday (week 48), the Christmas fortnight
    (weeks 51–52), a summer lull — where the effect repeats annually. For a one-off
    anomaly in a single named week, use an event dummy instead (see ingestion.events).
    """
    weeks = set(int(w) for w in iso_weeks)
    if not weeks:
        raise ValueError("iso_weeks must contain at least one week number")
    iso = index.isocalendar()
    mask = iso["week"].isin(weeks).to_numpy()
    return pd.Series(mask.astype(float), index=index, name=name)


def date_span_dummy(
    index: pd.DatetimeIndex, dates: Iterable, name: str = "event"
) -> pd.Series:
    """A 0/1 column that is 1 on the weeks containing any of the given dates.

    Each date is mapped to the Monday of its ISO week (the master-table convention), so
    a promotion on any weekday flags that whole week.
    """
    stamps = pd.to_datetime(list(dates))
    if len(stamps) == 0:
        raise ValueError("dates must contain at least one date")
    weeks = set(to_week_start(pd.Series(stamps)))
    mask = index.isin(weeks)
    return pd.Series(mask.astype(float), index=index, name=name)


def lagged_feature(series: pd.Series, lag: int, fill: float = 0.0) -> pd.Series:
    """Shift a series forward by ``lag`` weeks (a lagged control, e.g. last week's price)."""
    if lag < 1:
        raise ValueError("lag must be >= 1")
    return series.shift(lag).fillna(fill)


def rolling_mean(series: pd.Series, window: int, min_periods: int | None = None) -> pd.Series:
    """Trailing rolling mean — smooths a noisy control before it enters the model."""
    if window < 1:
        raise ValueError("window must be >= 1")
    return series.rolling(window, min_periods=min_periods or 1).mean()


def zscore(series: pd.Series) -> pd.Series:
    """Standardize to mean 0, sd 1 (a constant series returns all zeros)."""
    std = series.std(ddof=0)
    if not std or np.isnan(std):
        return pd.Series(np.zeros(len(series)), index=series.index, name=series.name)
    return (series - series.mean()) / std


def log1p_feature(series: pd.Series) -> pd.Series:
    """``log(1 + x)`` for a non-negative control (compresses a heavy right tail)."""
    if (series < 0).any():
        raise ValueError("log1p_feature expects non-negative values")
    return np.log1p(series)


def fill_missing(series: pd.Series, strategy: str) -> pd.Series:
    """Fill NaNs in a control column by a named strategy.

    Strategies: ``zero``, ``ffill``, ``bfill``, ``interpolate`` (linear), ``mean``,
    ``median``. This is the counterpart to the build-time guard that now *rejects*
    controls containing NaN — decide a fill here rather than let a gap corrupt the fit.
    """
    if strategy not in _FILL_STRATEGIES:
        raise ValueError(f"unknown fill strategy {strategy!r}; use one of {_FILL_STRATEGIES}")
    if strategy == "zero":
        return series.fillna(0.0)
    if strategy == "ffill":
        return series.ffill().bfill()
    if strategy == "bfill":
        return series.bfill().ffill()
    if strategy == "interpolate":
        return series.interpolate(limit_direction="both")
    if strategy == "mean":
        return series.fillna(series.mean())
    return series.fillna(series.median())


def flag_outliers(series: pd.Series, z: float = 5.0) -> pd.Series:
    """Boolean mask of points more than ``z`` robust-MADs from the median.

    Uses the median/MAD (not mean/std) so a few spikes don't hide themselves by inflating
    the scale. Pair with :func:`winsorize`, or turn flagged weeks into event dummies.
    """
    clean = series.dropna()
    median = clean.median()
    mad = (clean - median).abs().median()
    scale = mad * 1.4826 if mad > 0 else clean.std(ddof=0)
    if not scale or np.isnan(scale):
        return pd.Series(False, index=series.index, name=series.name)
    robust_z = (series - median) / scale
    return robust_z.abs() > z


def flag_local_outliers(series: pd.Series, window: int = 9, z: float = 5.0) -> pd.Series:
    """Boolean mask of points that are robust-z outliers relative to a CENTERED ROLLING
    window (local median/MAD), rather than the whole series' median/MAD.

    :func:`flag_outliers` compares every point to one global median/MAD, which is the
    wrong tool for a multi-year weekly KPI that trends or shifts level over time: a
    single-week spike can hide inside a global MAD wide enough to span years of drift, but
    still stands out sharply against its immediate neighbors. This looks at each point in
    the context of the ``window`` weeks centered on it instead, so a local spike is caught
    regardless of the series' long-run shape.
    """
    if window < 3:
        raise ValueError("window must be >= 3")
    min_periods = max(3, window // 2)
    rolling_median = series.rolling(window, center=True, min_periods=min_periods).median()
    rolling_mad = (series - rolling_median).abs().rolling(window, center=True, min_periods=min_periods).median()
    scale = (rolling_mad * 1.4826).replace(0.0, np.nan)
    robust_z = (series - rolling_median) / scale
    return robust_z.abs() > z


def winsorize(series: pd.Series, lower_q: float = 0.01, upper_q: float = 0.99) -> pd.Series:
    """Clip a series to its ``[lower_q, upper_q]`` quantiles (tames extreme values)."""
    if not 0.0 <= lower_q < upper_q <= 1.0:
        raise ValueError("require 0 <= lower_q < upper_q <= 1")
    lo, hi = series.quantile(lower_q), series.quantile(upper_q)
    return series.clip(lower=lo, upper=hi)
