"""Hierarchical (multi-region) MMM. Validation + graph construction run fast (they build
the PyMC graph but never sample); the recovery test is marked slow."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("pymc")

from mmm_core.model import ChannelConfig, ChannelType, ModelConfig  # noqa: E402
from mmm_core.model.hierarchical import (  # noqa: E402
    build_hierarchical_model,
    fit_hierarchical,
)
from mmm_core.transforms import (  # noqa: E402
    alpha_from_half_life,
    geometric_adstock,
    hill_saturation,
)


def _region_frame(beta_s, beta_b, seed, n=70, noise=80.0):
    idx = pd.date_range("2023-01-02", periods=n, freq="7D", name="week_start")
    r = np.random.default_rng(seed)

    def spend(base, s):
        rr = np.random.default_rng(s)
        return np.maximum(np.exp(np.log(base) + np.cumsum(rr.normal(0, 0.3, n)) * 0.1), 0.0)

    ss, so = spend(100, seed * 2), spend(80, seed * 2 + 1)

    def eff(sp, hl, hs, b):
        ad = geometric_adstock(sp, alpha_from_half_life(hl), 12, True)
        return b * hill_saturation(ad / ad.max(), hs, 1.0)

    kpi = (
        2000 + 3 * np.arange(n) + eff(ss, 1.0, 0.4, beta_s) + eff(so, 3.0, 0.5, beta_b)
        + r.normal(0, noise, n)
    )
    return pd.DataFrame({"leads": kpi, "search": ss, "social": so}, index=idx)


def _cfg():
    return ModelConfig(
        kpi="leads",
        channels=(ChannelConfig("search", ChannelType.INTENT), ChannelConfig("social", ChannelType.BRAND)),
    )


def _frames():
    return {
        "north": _region_frame(1800, 1200, 1),
        "south": _region_frame(1400, 900, 2),
        "small": _region_frame(300, 200, 3, noise=200.0),
    }


# --- validation ------------------------------------------------------------------

def test_requires_at_least_two_regions():
    with pytest.raises(ValueError, match="at least two regions"):
        build_hierarchical_model({"only": _region_frame(1000, 800, 1)}, _cfg())


def test_regions_must_share_the_same_weeks():
    a = _region_frame(1000, 800, 1)
    b = _region_frame(1000, 800, 2, n=60)  # different length -> misaligned index
    with pytest.raises(ValueError, match="aligned weeks"):
        build_hierarchical_model({"a": a, "b": b}, _cfg())


def test_missing_column_in_a_region_raises():
    a = _region_frame(1000, 800, 1)
    b = _region_frame(1000, 800, 2).drop(columns=["social"])
    with pytest.raises(KeyError):
        build_hierarchical_model({"a": a, "b": b}, _cfg())


def test_graph_registers_per_region_and_pooled_parameters():
    built = build_hierarchical_model(_frames(), _cfg())
    named = built.model.named_vars
    assert "beta_search" in named and "beta_social" in named   # per-region (dims=region)
    assert "beta_logmu_search" in named                        # channel-level hyper-mean
    assert "intercept" in named                                # per-region intercept
    assert set(built.regions) == {"north", "south", "small"}


# --- recovery (slow) -------------------------------------------------------------

@pytest.mark.slow
def test_hierarchical_fit_pools_and_decomposes():
    summary, idata = fit_hierarchical(_frames(), _cfg(), draws=300, tune=300, chains=2, seed=0)
    d = summary.diagnostics
    assert d.max_r_hat < 1.1
    assert d.decomposition_ok
    assert d.r2_pooled > 0.7

    for ch in summary.channels:
        gs = ch.global_contribution_share
        assert 0.0 < gs.p50 < 1.0
        assert gs.p3 <= gs.p50 <= gs.p97
        assert set(ch.per_region_share) == {"north", "south", "small"}
        # regions are not forced identical — real heterogeneity is captured
        region_p50s = [iv.p50 for iv in ch.per_region_share.values()]
        assert max(region_p50s) - min(region_p50s) > 1e-3

    import json
    json.dumps(summary.to_json_dict())
