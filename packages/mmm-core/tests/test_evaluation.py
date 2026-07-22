"""Fast tests for the evaluation toolbox: the cross-validation and placebo *logic*,
exercised with stub fit/predict functions so no PyMC sampling is needed."""

import types

import numpy as np
import pandas as pd
import pytest

from mmm_core.evaluation import (
    add_placebo_channel,
    expanding_splits,
    judge_placebo,
    time_series_cv,
)
from mmm_core.model import ChannelConfig, ChannelType, ModelConfig


# --- expanding-origin splits -----------------------------------------------------

def test_expanding_splits_basic():
    # n=20, min_train=10, horizon=4, step=4 -> 10 (14 test), 14 (18 test); 18+4>20 stops.
    assert expanding_splits(20, min_train_weeks=10, horizon=4, step=4) == [10, 14]
    # step=2 fills in the intermediate origin.
    assert expanding_splits(20, min_train_weeks=10, horizon=4, step=2) == [10, 12, 14, 16]


def test_expanding_splits_default_step_is_horizon():
    assert expanding_splits(24, min_train_weeks=12, horizon=6) == [12, 18]


def test_expanding_splits_validates_args():
    with pytest.raises(ValueError):
        expanding_splits(20, min_train_weeks=1, horizon=4)
    with pytest.raises(ValueError):
        expanding_splits(20, min_train_weeks=10, horizon=0)


# --- CV loop with injected stubs -------------------------------------------------

def _frame(n=40):
    idx = pd.date_range("2022-01-03", periods=n, freq="7D", name="week_start")
    rng = np.random.default_rng(0)
    return pd.DataFrame({"kpi": 100 + np.arange(n) + rng.normal(0, 1, n), "g": rng.uniform(1, 10, n)}, index=idx)


def _cfg():
    return ModelConfig(kpi="kpi", channels=(ChannelConfig("g", ChannelType.INTENT),))


def test_time_series_cv_runs_all_folds_with_stubs():
    data = _frame(40)

    def fake_fit(train, config, **kw):
        return {"mean": float(train[config.kpi].mean())}

    def fake_predict(handle, full):
        return np.full(len(full), handle["mean"])  # constant prediction = train mean

    res = time_series_cv(
        data, _cfg(), min_train_weeks=20, horizon=4, step=4,
        fit_fn=fake_fit, predict_fn=fake_predict,
    )
    assert len(res.folds) == len(expanding_splits(40, 20, 4, 4))
    assert all(f.test_weeks == 4 for f in res.folds)
    assert np.isfinite(res.mean_r2) and np.isfinite(res.mean_mape)


def test_time_series_cv_accepts_2d_posterior_predictions():
    data = _frame(30)

    def fake_fit(train, config, **kw):
        return float(train[config.kpi].mean())

    def fake_predict(handle, full):
        # (T, S) posterior samples around the train mean
        return np.full((len(full), 5), handle) + np.linspace(-1, 1, 5)[None, :]

    res = time_series_cv(
        data, _cfg(), min_train_weeks=16, horizon=4, fit_fn=fake_fit, predict_fn=fake_predict
    )
    assert len(res.folds) >= 1


def test_time_series_cv_perfect_prediction_scores_r2_one():
    data = _frame(30)

    def fake_fit(train, config, **kw):
        return None

    def fake_predict(handle, full):
        return data["kpi"].to_numpy()[: len(full)]  # exact -> R2 == 1 on the test slice

    res = time_series_cv(
        data, _cfg(), min_train_weeks=16, horizon=4, fit_fn=fake_fit, predict_fn=fake_predict
    )
    assert res.mean_r2 == pytest.approx(1.0)


def test_time_series_cv_raises_when_no_folds_fit():
    with pytest.raises(ValueError):
        time_series_cv(_frame(10), _cfg(), min_train_weeks=52, horizon=8,
                       fit_fn=lambda *a, **k: None, predict_fn=lambda *a, **k: np.zeros(10))


# --- placebo ---------------------------------------------------------------------

def test_add_placebo_channel_appends_column_and_channel():
    data = _frame(30)
    cfg = _cfg()
    data2, cfg2 = add_placebo_channel(data, cfg, name="placebo")
    assert "placebo" in data2.columns
    assert [c.name for c in cfg2.channels] == ["g", "placebo"]
    # original inputs untouched
    assert "placebo" not in data.columns
    assert len(cfg.channels) == 1


def test_add_placebo_channel_rejects_existing_name():
    data = _frame(30)
    with pytest.raises(ValueError):
        add_placebo_channel(data, _cfg(), name="g")


def _stub_summary(shares: dict[str, float]):
    chans = [
        types.SimpleNamespace(name=n, contribution_share=types.SimpleNamespace(p50=v))
        for n, v in shares.items()
    ]
    return types.SimpleNamespace(channels=chans)


def test_judge_placebo_passes_for_small_share():
    summary = _stub_summary({"g": 0.4, "placebo": 0.01})
    res = judge_placebo(summary, "placebo", share_threshold=0.05)
    assert res.ok is True


def test_judge_placebo_fails_for_large_share():
    summary = _stub_summary({"g": 0.4, "placebo": 0.2})
    res = judge_placebo(summary, "placebo", share_threshold=0.05)
    assert res.ok is False


def test_judge_placebo_missing_channel_raises():
    with pytest.raises(ValueError):
        judge_placebo(_stub_summary({"g": 0.4}), "placebo")
