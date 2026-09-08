"""Build-time guards: these construct the PyMC graph (needs the model extra) but never
sample, so they run fast. They pin the robustness checks that stop a corrupt dataset
from silently producing a garbage fit.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("pymc")

from mmm_core.model import (  # noqa: E402
    ChannelConfig,
    ChannelType,
    ChannelUnit,
    KpiType,
    LikelihoodType,
    ModelConfig,
    RoasCalibration,
)
from mmm_core.model.build import build_model  # noqa: E402


def _frame(n=30):
    idx = pd.date_range("2022-01-03", periods=n, freq="7D", name="week_start")
    rng = np.random.default_rng(0)
    return pd.DataFrame(
        {"kpi": 1000 + rng.normal(0, 10, n), "google": rng.uniform(10, 100, n)}, index=idx
    )


def _cfg(**kw):
    return ModelConfig(kpi="kpi", channels=(ChannelConfig("google", ChannelType.INTENT),), **kw)


def test_control_column_with_nan_raises_before_sampling():
    df = _frame()
    df["price"] = np.linspace(9.0, 11.0, len(df))
    df.iloc[5, df.columns.get_loc("price")] = np.nan
    with pytest.raises(ValueError, match="control column 'price' contains"):
        build_model(df, _cfg(control_columns=("price",)))


def test_kpi_with_nan_raises():
    df = _frame()
    df.iloc[3, df.columns.get_loc("kpi")] = np.nan
    with pytest.raises(ValueError, match="KPI column contains"):
        build_model(df, _cfg())


def test_channel_spend_with_nan_raises():
    df = _frame()
    df.iloc[3, df.columns.get_loc("google")] = np.nan
    with pytest.raises(ValueError, match="channel column contains"):
        build_model(df, _cfg())


def test_missing_control_column_raises_keyerror():
    with pytest.raises(KeyError):
        build_model(_frame(), _cfg(control_columns=("nonexistent",)))


def test_clean_control_builds_without_error():
    df = _frame()
    df["price"] = np.linspace(9.0, 11.0, len(df))
    built = build_model(df, _cfg(control_columns=("price",)))
    assert "control_price" in built.model.named_vars


def test_count_likelihood_rejects_non_integer_kpi():
    df = _frame()
    df["kpi"] = df["kpi"] + 0.5  # clearly non-integer
    with pytest.raises(ValueError, match="integer KPI"):
        build_model(df, _cfg(likelihood=LikelihoodType.POISSON, kpi_type=KpiType.ORDERS))


def test_count_likelihood_accepts_integer_kpi():
    df = _frame()
    df["kpi"] = np.arange(len(df), dtype=float) + 5.0  # whole numbers
    built = build_model(
        df, _cfg(likelihood=LikelihoodType.NEGATIVE_BINOMIAL, kpi_type=KpiType.ORDERS)
    )
    assert "nb_alpha" in built.model.named_vars
    assert "sigma" not in built.model.named_vars  # count link has no Gaussian noise term


def test_calibration_with_count_likelihood_is_rejected():
    df = _frame()
    df["kpi"] = np.arange(len(df), dtype=float) + 5.0
    cfg = ModelConfig(
        kpi="kpi",
        channels=(ChannelConfig("google", ChannelType.INTENT, calibration=RoasCalibration(2.0, 0.5)),),
        likelihood=LikelihoodType.POISSON,
        kpi_type=KpiType.ORDERS,
    )
    with pytest.raises(ValueError, match="calibration is not yet supported"):
        build_model(df, cfg)


# --- refusing to fit a channel that cannot carry its own parameters ----------------
# A channel with no variation still produces a contribution and a ROAS once fitted, but
# those numbers come entirely from the prior. Reporting them as measurements is the most
# misleading thing this system could do, so the build refuses outright.


def test_all_zero_channel_is_refused():
    df = _frame()
    df["google"] = 0.0
    with pytest.raises(ValueError, match="no pressure at all"):
        build_model(df, _cfg())


def test_channel_with_too_few_active_weeks_is_refused():
    df = _frame()
    spend = np.zeros(len(df))
    spend[:5] = 50.0  # only five weeks ever ran
    df["google"] = spend
    with pytest.raises(ValueError, match="active week"):
        build_model(df, _cfg())


def test_constant_channel_is_refused():
    df = _frame()
    df["google"] = 42.0
    with pytest.raises(ValueError, match="constant pressure"):
        build_model(df, _cfg())


def test_barely_varying_channel_is_refused():
    # Not literally constant, but a 0.1% wobble carries no signal either — and unlike an
    # exactly-constant column this one sails past a naive `std == 0` test.
    df = _frame()
    df["google"] = 42.0 + np.linspace(0, 0.04, len(df))
    with pytest.raises(ValueError, match="coefficient of variation"):
        build_model(df, _cfg())


def test_negative_pressure_is_refused():
    df = _frame()
    df.iloc[4, df.columns.get_loc("google")] = -10.0
    with pytest.raises(ValueError, match="negative pressure"):
        build_model(df, _cfg())


def test_constant_control_is_refused():
    df = _frame()
    df["price"] = 9.99  # never moves
    with pytest.raises(ValueError, match="constant over the whole window"):
        build_model(df, _cfg(control_columns=("price",)))


# --- adstock warm-up ---------------------------------------------------------------


def test_burn_in_shrinks_the_observed_window_only():
    df = _frame(n=40)
    built = build_model(df, _cfg(burn_in_weeks=6))
    assert built.burn_in == 6
    # `mu` still spans every week (earlier weeks feed later weeks' carry-over) ...
    assert built.model.named_vars["mu"].type.shape[0] in (None, 40)
    # ... but the likelihood only sees the weeks after the warm-up.
    assert len(built.model.coords["obs_date"]) == 34
    assert len(built.model.coords["date"]) == 40


def test_burn_in_that_swallows_the_dataset_is_refused():
    df = _frame(n=10)
    with pytest.raises(ValueError, match="leaves no observations"):
        build_model(df, _cfg(burn_in_weeks=10))
