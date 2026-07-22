import numpy as np
import pandas as pd
import pytest

from mmm_core.features import (
    date_span_dummy,
    fill_missing,
    flag_local_outliers,
    flag_outliers,
    fourier_seasonality,
    lagged_feature,
    log1p_feature,
    recurring_week_dummy,
    rolling_mean,
    winsorize,
    zscore,
)


def _weeks(start="2022-01-03", n=60):
    return pd.date_range(start, periods=n, freq="7D", name="week_start")


# --- fourier seasonality ---------------------------------------------------------

def test_fourier_shape_and_periodicity():
    idx = _weeks(n=104)
    feats = fourier_seasonality(idx, period_weeks=52.0, n_modes=2)
    assert list(feats.columns) == ["season_sin1", "season_cos1", "season_sin2", "season_cos2"]
    # one full 52-week cycle: sin1 at t=0 and t=52 must match.
    assert feats["season_sin1"].iloc[0] == pytest.approx(feats["season_sin1"].iloc[52], abs=1e-9)


def test_fourier_rejects_bad_args():
    with pytest.raises(ValueError):
        fourier_seasonality(_weeks(), period_weeks=0, n_modes=1)
    with pytest.raises(ValueError):
        fourier_seasonality(_weeks(), period_weeks=52, n_modes=0)


# --- calendar dummies ------------------------------------------------------------

def test_recurring_week_dummy_marks_that_week_every_year():
    idx = _weeks(start="2022-01-03", n=160)  # ~3 years
    d = recurring_week_dummy(idx, iso_weeks=[52], name="xmas")
    weeks = idx.isocalendar()["week"].to_numpy()
    assert np.array_equal((d.to_numpy() == 1.0), (weeks == 52))
    assert d.sum() >= 2  # appears in multiple years


def test_date_span_dummy_flags_the_week_containing_a_date():
    idx = _weeks(start="2022-01-03", n=10)
    # a Thursday inside the second week (2022-01-10 .. 2022-01-16)
    d = date_span_dummy(idx, dates=["2022-01-13"], name="promo")
    assert d.loc[pd.Timestamp("2022-01-10")] == 1.0
    assert d.sum() == 1.0


def test_empty_calendar_inputs_raise():
    with pytest.raises(ValueError):
        recurring_week_dummy(_weeks(), iso_weeks=[])
    with pytest.raises(ValueError):
        date_span_dummy(_weeks(), dates=[])


# --- lags / smoothing / transforms -----------------------------------------------

def test_lagged_feature_shifts_forward():
    s = pd.Series([1.0, 2.0, 3.0, 4.0], index=_weeks(n=4))
    lagged = lagged_feature(s, lag=1, fill=0.0)
    assert lagged.tolist() == [0.0, 1.0, 2.0, 3.0]


def test_rolling_mean_smooths():
    s = pd.Series([0.0, 0.0, 3.0, 0.0], index=_weeks(n=4))
    assert rolling_mean(s, window=2).iloc[2] == pytest.approx(1.5)


def test_zscore_standardizes():
    s = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0], index=_weeks(n=5))
    z = zscore(s)
    assert z.mean() == pytest.approx(0.0, abs=1e-9)
    assert z.std(ddof=0) == pytest.approx(1.0)


def test_zscore_constant_series_is_all_zero():
    s = pd.Series([7.0] * 4, index=_weeks(n=4))
    assert (zscore(s) == 0.0).all()


def test_log1p_feature_rejects_negatives():
    with pytest.raises(ValueError):
        log1p_feature(pd.Series([-1.0, 2.0]))


# --- fill / outliers -------------------------------------------------------------

def test_fill_missing_strategies():
    s = pd.Series([1.0, np.nan, np.nan, 4.0], index=_weeks(n=4))
    assert fill_missing(s, "zero").tolist() == [1.0, 0.0, 0.0, 4.0]
    assert fill_missing(s, "ffill").tolist() == [1.0, 1.0, 1.0, 4.0]
    assert fill_missing(s, "interpolate").tolist() == [1.0, 2.0, 3.0, 4.0]
    assert fill_missing(s, "mean").iloc[1] == pytest.approx(2.5)


def test_fill_missing_unknown_strategy_raises():
    with pytest.raises(ValueError):
        fill_missing(pd.Series([1.0]), "bogus")


def test_flag_outliers_catches_a_spike():
    rng = np.random.default_rng(0)
    baseline = 10.0 + rng.normal(0.0, 1.0, 40)  # realistic noisy control
    s = pd.Series(np.append(baseline, 1000.0), index=_weeks(n=41))
    mask = flag_outliers(s, z=5.0)
    assert bool(mask.iloc[-1]) is True
    assert mask.iloc[:-1].sum() == 0


def test_flag_local_outliers_catches_a_spike_hidden_by_a_long_run_trend():
    # A 3-year upward-trending series (mirrors a real weekly KPI regime shift): the
    # global median/MAD is wide enough to span the whole trend, so a single local spike
    # can hide from flag_outliers while still standing out against its own neighbours.
    rng = np.random.default_rng(2)
    n = 156
    trend = np.linspace(550.0, 950.0, n)
    baseline = trend + rng.normal(0.0, 15.0, n)
    spike_pos = 100
    baseline[spike_pos] = trend[spike_pos] + 400.0  # a sharp one-week jump
    s = pd.Series(baseline, index=_weeks(n=n))

    local_mask = flag_local_outliers(s, window=9, z=5.0)
    assert bool(local_mask.iloc[spike_pos]) is True
    assert local_mask.sum() == 1

    global_mask = flag_outliers(s, z=5.0)
    assert bool(global_mask.iloc[spike_pos]) is False


def test_flag_local_outliers_rejects_short_window():
    with pytest.raises(ValueError):
        flag_local_outliers(pd.Series([1.0, 2.0, 3.0]), window=2)


def test_winsorize_clips_extremes():
    s = pd.Series(list(range(100)), index=_weeks(n=100), dtype=float)
    w = winsorize(s, lower_q=0.05, upper_q=0.95)
    assert w.max() <= s.quantile(0.95)
    assert w.min() >= s.quantile(0.05)
