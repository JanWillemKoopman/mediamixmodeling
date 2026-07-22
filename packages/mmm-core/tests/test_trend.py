import numpy as np
import pytest

from mmm_core.model import ModelConfig, ChannelConfig, TrendType
from mmm_core.model.build import changepoint_locations, changepoint_matrix


def test_changepoint_locations_count_and_range():
    cps = changepoint_locations(6)
    assert len(cps) == 6
    assert cps.min() > 0.0 and cps.max() <= 0.8 + 1e-9
    assert np.all(np.diff(cps) > 0)  # strictly increasing


def test_changepoint_matrix_is_zero_before_and_ramps_after():
    t = np.linspace(0, 1, 11)
    cps = np.array([0.5])
    A = changepoint_matrix(t, cps)
    assert A.shape == (11, 1)
    assert np.all(A[t < 0.5] == 0.0)
    # after the changepoint it ramps linearly with slope 1
    after = t[t >= 0.5]
    assert np.allclose(A[t >= 0.5, 0], after - 0.5)


def test_changepoint_matrix_extends_past_training_window():
    t = np.array([1.5])  # a forecast week beyond training (t_scaled > 1)
    A = changepoint_matrix(t, np.array([0.5]))
    assert A[0, 0] == pytest.approx(1.0)  # keeps extending the last segment


def test_piecewise_trend_requires_a_changepoint():
    with pytest.raises(ValueError):
        ModelConfig(
            kpi="k",
            channels=(ChannelConfig("g"),),
            trend_type=TrendType.PIECEWISE,
            n_changepoints=0,
        )


def test_default_trend_is_linear():
    m = ModelConfig(kpi="k", channels=(ChannelConfig("g"),))
    assert m.trend_type is TrendType.LINEAR
