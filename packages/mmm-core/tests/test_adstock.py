import numpy as np
import pytest

from mmm_core.transforms import (
    adstock_weights,
    alpha_from_half_life,
    geometric_adstock,
    half_life_from_alpha,
)


def _impulse(n=30, at=10, height=1.0):
    x = np.zeros(n)
    x[at] = height
    return x


# --- half-life <-> alpha ---------------------------------------------------------

def test_half_life_alpha_roundtrip():
    for hl in (1.0, 2.0, 3.5, 8.0):
        alpha = alpha_from_half_life(hl)
        assert half_life_from_alpha(alpha) == pytest.approx(hl)


def test_alpha_from_half_life_halves_after_half_life():
    alpha = alpha_from_half_life(2.0)
    assert alpha ** 2 == pytest.approx(0.5)


# --- normalized adstock preserves mass ------------------------------------------

def test_normalized_adstock_preserves_total_for_interior_impulse():
    # impulse far from both ends (tail room >= l_max) -> no mass truncated.
    x = _impulse(n=40, at=10, height=5.0)
    y = geometric_adstock(x, alpha=0.6, l_max=8, normalize=True)
    assert y.sum() == pytest.approx(5.0)


def test_normalized_impulse_response_decays_geometrically():
    x = _impulse(n=40, at=10)
    alpha = 0.7
    y = geometric_adstock(x, alpha=alpha, l_max=10, normalize=True)
    # response starts at the impulse and each step down is a factor alpha.
    ratios = y[11:19] / y[10:18]
    assert np.allclose(ratios, alpha)
    # strictly decreasing carry-over.
    assert np.all(np.diff(y[10:20]) < 0)


def test_impulse_response_halves_after_half_life():
    x = _impulse(n=40, at=10)
    hl = 3.0
    y = geometric_adstock(x, alpha=alpha_from_half_life(hl), l_max=12, normalize=True)
    assert y[10 + 3] / y[10] == pytest.approx(0.5)


# --- causality & edge behaviour --------------------------------------------------

def test_adstock_is_causal_no_leak_before_impulse():
    x = _impulse(n=20, at=10)
    y = geometric_adstock(x, alpha=0.8, l_max=6, normalize=True)
    assert np.all(y[:10] == 0.0)


def test_alpha_zero_is_identity():
    x = np.array([1.0, 2.0, 3.0, 0.0, 5.0])
    y = geometric_adstock(x, alpha=0.0, l_max=5, normalize=True)
    assert np.allclose(y, x)


def test_unnormalized_impulse_sum_matches_geometric_series():
    x = _impulse(n=60, at=5)
    alpha, l_max = 0.5, 10
    y = geometric_adstock(x, alpha=alpha, l_max=l_max, normalize=False)
    expected = (1 - alpha ** l_max) / (1 - alpha)  # sum of the raw weights
    assert y.sum() == pytest.approx(expected)


# --- multi-channel ---------------------------------------------------------------

def test_2d_per_channel_alpha_is_independent():
    x = np.zeros((30, 2))
    x[10, 0] = 1.0
    x[10, 1] = 1.0
    y = geometric_adstock(x, alpha=np.array([0.2, 0.9]), l_max=8, normalize=True)
    # faster-decaying channel 0 concentrates more mass at the impulse than channel 1.
    assert y[10, 0] > y[10, 1]
    # each column independently preserves its own unit mass.
    assert y[:, 0].sum() == pytest.approx(1.0)
    assert y[:, 1].sum() == pytest.approx(1.0)


# --- validation ------------------------------------------------------------------

@pytest.mark.parametrize("bad_alpha", [1.0, 1.5, -0.1])
def test_invalid_alpha_raises(bad_alpha):
    with pytest.raises(ValueError):
        geometric_adstock(np.ones(5), alpha=bad_alpha, l_max=4)


def test_invalid_l_max_raises():
    with pytest.raises(ValueError):
        adstock_weights(0.5, l_max=0)
