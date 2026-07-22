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
    df["price"] = 9.99
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
    with pytest.raises(ValueError, match="channel spend column contains"):
        build_model(df, _cfg())


def test_missing_control_column_raises_keyerror():
    with pytest.raises(KeyError):
        build_model(_frame(), _cfg(control_columns=("nonexistent",)))


def test_clean_control_builds_without_error():
    df = _frame()
    df["price"] = 9.99
    built = build_model(df, _cfg(control_columns=("price",)))
    assert "control_price" in built.model.named_vars


def test_count_likelihood_rejects_non_integer_kpi():
    df = _frame()
    df["kpi"] = df["kpi"] + 0.5  # clearly non-integer
    with pytest.raises(ValueError, match="integer KPI"):
        build_model(df, _cfg(likelihood=LikelihoodType.POISSON))


def test_count_likelihood_accepts_integer_kpi():
    df = _frame()
    df["kpi"] = np.arange(len(df), dtype=float) + 5.0  # whole numbers
    built = build_model(df, _cfg(likelihood=LikelihoodType.NEGATIVE_BINOMIAL))
    assert "nb_alpha" in built.model.named_vars
    assert "sigma" not in built.model.named_vars  # count link has no Gaussian noise term


def test_calibration_with_count_likelihood_is_rejected():
    df = _frame()
    df["kpi"] = np.arange(len(df), dtype=float) + 5.0
    cfg = ModelConfig(
        kpi="kpi",
        channels=(ChannelConfig("google", ChannelType.INTENT, calibration=RoasCalibration(2.0, 0.5)),),
        likelihood=LikelihoodType.POISSON,
    )
    with pytest.raises(ValueError, match="calibration is not yet supported"):
        build_model(df, cfg)
