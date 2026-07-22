import numpy as np
import pytest

from mmm_core.model import (
    check_decomposition_adds_up,
    check_interval_coverage,
    decomposition_residual,
    interval_coverage,
)


def test_decomposition_residual_zero_when_components_sum_to_total():
    total = np.array([10.0, 20.0, 30.0])
    comps = {"a": np.array([4.0, 6.0, 10.0]), "b": np.array([6.0, 14.0, 20.0])}
    assert np.allclose(decomposition_residual(total, comps), 0.0)


def test_check_decomposition_passes_and_fails():
    total = np.array([10.0, 20.0, 30.0])
    good = {"a": np.array([5.0, 10.0, 15.0]), "b": np.array([5.0, 10.0, 15.0])}
    bad = {"a": np.array([5.0, 10.0, 15.0]), "b": np.array([1.0, 1.0, 1.0])}
    assert check_decomposition_adds_up(total, good).ok
    assert not check_decomposition_adds_up(total, bad).ok


def test_interval_coverage_counts_points_inside():
    actual = np.array([1.0, 2.0, 3.0, 4.0])
    lower = np.array([0.0, 0.0, 0.0, 5.0])   # last point falls outside
    upper = np.array([2.0, 2.0, 2.0, 6.0])   # 3.0 also outside [0,2]
    # inside: 1.0 (yes), 2.0 (yes, boundary), 3.0 (no), 4.0 (no) -> 0.5
    assert interval_coverage(actual, lower, upper) == pytest.approx(0.5)


def test_coverage_check_tolerance():
    rng = np.random.default_rng(0)
    n = 5000
    actual = rng.normal(0, 1, n)
    # a symmetric ~90% interval for a standard normal is +-1.645
    lower = np.full(n, -1.645)
    upper = np.full(n, 1.645)
    res = check_interval_coverage(actual, lower, upper, nominal=0.9, tolerance=0.03)
    assert res.ok
    # a far-too-narrow interval should fail the same check
    bad = check_interval_coverage(actual, np.full(n, -0.2), np.full(n, 0.2), nominal=0.9)
    assert not bad.ok


def test_coverage_shape_mismatch_raises():
    with pytest.raises(ValueError):
        interval_coverage(np.zeros(3), np.zeros(2), np.zeros(3))
