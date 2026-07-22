import numpy as np
import pytest

from mmm_core.transforms import delayed_adstock, delayed_adstock_weights


def _impulse(n=30, at=5, height=1.0):
    x = np.zeros(n)
    x[at] = height
    return x


def test_weights_peak_at_theta():
    w = delayed_adstock_weights(alpha=0.6, theta=3.0, l_max=12, normalize=True)
    assert int(np.argmax(w)) == 3


def test_theta_zero_peaks_immediately_like_a_decaying_curve():
    w = delayed_adstock_weights(alpha=0.6, theta=0.0, l_max=12, normalize=True)
    assert int(np.argmax(w)) == 0
    assert np.all(np.diff(w) < 0)  # strictly decaying from lag 0


def test_normalized_weights_sum_to_one():
    w = delayed_adstock_weights(alpha=0.7, theta=2.0, l_max=10, normalize=True)
    assert w.sum() == pytest.approx(1.0)


def test_impulse_response_peaks_theta_weeks_after_spend():
    x = _impulse(n=30, at=5)
    y = delayed_adstock(x, alpha=0.6, theta=3.0, l_max=12, normalize=True)
    # response is zero before the spend (causal) and peaks 3 weeks after it.
    assert np.all(y[:5] == 0.0)
    assert int(np.argmax(y)) == 5 + 3


def test_is_causal_no_leak_before_impulse():
    x = _impulse(n=20, at=8)
    y = delayed_adstock(x, alpha=0.8, theta=2.0, l_max=6, normalize=True)
    assert np.all(y[:8] == 0.0)


def test_per_channel_theta_is_independent():
    x = np.zeros((30, 2))
    x[5, 0] = 1.0
    x[5, 1] = 1.0
    y = delayed_adstock(x, alpha=0.7, theta=np.array([1.0, 4.0]), l_max=12, normalize=True)
    assert int(np.argmax(y[:, 0])) == 5 + 1
    assert int(np.argmax(y[:, 1])) == 5 + 4


@pytest.mark.parametrize("bad_alpha", [0.0, 1.0, 1.5, -0.1])
def test_invalid_alpha_raises(bad_alpha):
    with pytest.raises(ValueError):
        delayed_adstock(np.ones(5), alpha=bad_alpha, theta=1.0, l_max=4)


def test_negative_theta_raises():
    with pytest.raises(ValueError):
        delayed_adstock_weights(alpha=0.5, theta=-1.0, l_max=4)
