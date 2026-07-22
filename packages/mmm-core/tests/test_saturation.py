import numpy as np
import pytest

from mmm_core.transforms import (
    hill_saturation,
    logistic_saturation,
    saturation_half_point,
)


def test_zero_spend_gives_zero_response():
    assert hill_saturation(0.0, half_saturation=100.0, slope=1.0) == 0.0


def test_half_saturation_point_gives_half_response():
    assert hill_saturation(100.0, half_saturation=100.0, slope=1.0) == pytest.approx(0.5)
    # holds regardless of slope
    assert hill_saturation(100.0, half_saturation=100.0, slope=2.5) == pytest.approx(0.5)


def test_response_is_monotonic_increasing():
    x = np.linspace(0, 1000, 200)
    y = hill_saturation(x, half_saturation=250.0, slope=1.3)
    assert np.all(np.diff(y) >= 0)


def test_response_is_bounded_below_one():
    x = np.linspace(0, 1e6, 500)
    y = hill_saturation(x, half_saturation=100.0, slope=1.0)
    assert np.all((y >= 0.0) & (y < 1.0))


def test_saturates_towards_one_for_large_spend():
    y = hill_saturation(1e9, half_saturation=100.0, slope=1.0)
    assert y == pytest.approx(1.0, abs=1e-6)


def test_slope_above_one_is_s_shaped_below_half_saturation():
    # For an S-curve (slope>1), response near the origin sits *below* the linear
    # slope-1 curve (slow start), then overtakes it after the half-saturation point.
    x = np.array([10.0, 50.0])
    concave = hill_saturation(x, half_saturation=100.0, slope=1.0)
    s_curve = hill_saturation(x, half_saturation=100.0, slope=2.0)
    assert np.all(s_curve < concave)


def test_per_channel_parameters_on_2d_input():
    x = np.full((5, 2), 100.0)
    y = hill_saturation(x, half_saturation=np.array([100.0, 400.0]), slope=1.0)
    # channel 0 is at its half-saturation (0.5); channel 1 is well below it (<0.5).
    assert np.allclose(y[:, 0], 0.5)
    assert np.all(y[:, 1] < 0.5)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"half_saturation": 0.0, "slope": 1.0},
        {"half_saturation": -1.0, "slope": 1.0},
        {"half_saturation": 100.0, "slope": 0.0},
    ],
)
def test_invalid_parameters_raise(kwargs):
    with pytest.raises(ValueError):
        hill_saturation(50.0, **kwargs)


def test_negative_spend_raises():
    with pytest.raises(ValueError):
        hill_saturation(np.array([-1.0, 2.0]), half_saturation=100.0)


# --- logistic saturation ---------------------------------------------------------

def test_logistic_zero_spend_gives_zero_response():
    assert logistic_saturation(0.0, lam=0.5) == 0.0


def test_logistic_is_monotonic_and_bounded():
    x = np.linspace(0, 1000, 300)
    y = logistic_saturation(x, lam=0.01)
    assert np.all(np.diff(y) >= 0)
    assert np.all((y >= 0.0) & (y < 1.0))


def test_logistic_saturates_towards_one():
    assert logistic_saturation(1e6, lam=1.0) == pytest.approx(1.0, abs=1e-6)


def test_logistic_steeper_lam_saturates_sooner():
    x = 50.0
    assert logistic_saturation(x, lam=0.1) > logistic_saturation(x, lam=0.01)


def test_logistic_per_channel_lam_on_2d_input():
    x = np.full((4, 2), 50.0)
    y = logistic_saturation(x, lam=np.array([0.01, 0.1]))
    assert np.all(y[:, 1] > y[:, 0])


@pytest.mark.parametrize("bad_lam", [0.0, -1.0])
def test_logistic_invalid_lam_raises(bad_lam):
    with pytest.raises(ValueError):
        logistic_saturation(10.0, lam=bad_lam)


def test_logistic_negative_spend_raises():
    with pytest.raises(ValueError):
        logistic_saturation(np.array([-1.0, 2.0]), lam=0.5)


# --- comparable half-point across families ---------------------------------------

def test_saturation_half_point_hill_is_kappa():
    assert saturation_half_point("hill", {"half_saturation": 250.0}) == 250.0


def test_saturation_half_point_logistic_reaches_half_response():
    half = saturation_half_point("logistic", {"lam": 0.02})
    assert logistic_saturation(half, lam=0.02) == pytest.approx(0.5)


def test_saturation_half_point_unknown_family_raises():
    with pytest.raises(ValueError):
        saturation_half_point("nope", {})
