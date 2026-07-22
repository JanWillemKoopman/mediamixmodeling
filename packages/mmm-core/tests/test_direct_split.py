"""Unit tests for the direct vs carry-over split helpers (pure numpy, no PyMC)."""

import numpy as np

from mmm_core.model.fit import adstock_direct_fraction, lag_matrix


def test_lag_matrix_shifts_series():
    x = np.array([1.0, 2.0, 3.0, 4.0])
    m = lag_matrix(x, 3)
    assert m.shape == (4, 3)
    np.testing.assert_allclose(m[:, 0], x)
    np.testing.assert_allclose(m[:, 1], [0.0, 1.0, 2.0, 3.0])
    np.testing.assert_allclose(m[:, 2], [0.0, 0.0, 1.0, 2.0])


def test_all_mass_at_lag_zero_means_fully_direct():
    x = np.array([5.0, 0.0, 3.0])
    weights = np.array([[1.0], [0.0], [0.0]])  # (l_max=3, S=1)
    frac = adstock_direct_fraction(x, weights)
    # Weeks with spend are 100% direct; the zero-spend week has an empty stock -> 0.
    np.testing.assert_allclose(frac[:, 0], [1.0, 0.0, 1.0])


def test_geometric_carryover_fraction_matches_hand_computation():
    # x = [10, 0]; geometric alpha=0.5 over l_max=2 -> normalized weights [2/3, 1/3].
    # Week 0: stock = 2/3*10, all from week 0 -> direct fraction 1.
    # Week 1: stock = 1/3*10, all carry-over from week 0 -> direct fraction 0.
    x = np.array([10.0, 0.0])
    w = np.array([[2.0 / 3.0], [1.0 / 3.0]])
    frac = adstock_direct_fraction(x, w)
    np.testing.assert_allclose(frac[:, 0], [1.0, 0.0])

    # Constant spend: direct fraction equals w0 / (w0 + w1) once the stock is warm.
    x2 = np.array([10.0, 10.0, 10.0])
    frac2 = adstock_direct_fraction(x2, np.vstack([w, [[0.0]]])[:3])
    np.testing.assert_allclose(frac2[1:, 0], 2.0 / 3.0)


def test_direct_fraction_is_scale_invariant():
    rng = np.random.default_rng(7)
    x = rng.uniform(0, 100, size=12)
    w = rng.uniform(0.01, 1, size=(4, 5))
    w = w / w.sum(axis=0, keepdims=True)
    np.testing.assert_allclose(
        adstock_direct_fraction(x, w), adstock_direct_fraction(x / x.max(), w)
    )


def test_fractions_stay_within_unit_interval():
    rng = np.random.default_rng(11)
    x = rng.uniform(0, 50, size=30)
    w = rng.uniform(0.0, 1, size=(6, 8))
    w = w / w.sum(axis=0, keepdims=True)
    frac = adstock_direct_fraction(x, w)
    assert frac.min() >= 0.0
    assert frac.max() <= 1.0 + 1e-12
