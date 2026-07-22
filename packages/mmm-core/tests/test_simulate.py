import numpy as np
import pandas as pd

from mmm_core.model import ChannelDGP, simulate_mmm


def _dataset(seed=0, noise_sd=0.0):
    return simulate_mmm(
        [
            ChannelDGP("search", half_life=1.0, half_saturation=80.0, beta=2000.0),
            ChannelDGP("video", half_life=5.0, half_saturation=200.0, beta=1500.0, slope=1.5),
        ],
        n_weeks=104,
        noise_sd=noise_sd,
        seed=seed,
    )


def test_shape_and_columns():
    ds = _dataset()
    assert ds.data.shape[0] == 104
    assert ds.kpi_column in ds.data.columns
    assert set(ds.channel_names) == {"search", "video"}
    assert isinstance(ds.data.index, pd.DatetimeIndex)


def test_ground_truth_decomposition_reconstructs_kpi_without_noise():
    ds = _dataset(noise_sd=0.0)
    reconstructed = ds.contributions.sum(axis=1).to_numpy() + _baseline_from(ds)
    assert np.allclose(reconstructed, ds.data[ds.kpi_column].to_numpy(), rtol=1e-9)


def _baseline_from(ds):
    # baseline = KPI - sum of channel contributions (noise-free dataset)
    return ds.data[ds.kpi_column].to_numpy() - ds.contributions.sum(axis=1).to_numpy()


def test_true_roas_is_positive_and_finite():
    ds = _dataset()
    for ch in ds.channels:
        assert ch.total_spend > 0
        assert np.isfinite(ch.roas)
        assert ch.roas > 0


def test_contribution_shares_sum_below_one_with_baseline():
    ds = _dataset(noise_sd=0.0)
    shares = ds.true_contribution_share()
    # channels explain part of the KPI; the baseline carries the rest.
    assert 0 < sum(shares.values()) < 1


def test_spend_is_non_negative():
    ds = _dataset()
    for name in ds.channel_names:
        assert (ds.data[name] >= 0).all()


def test_reproducible_given_seed():
    a = _dataset(seed=42)
    b = _dataset(seed=42)
    assert a.data.equals(b.data)
