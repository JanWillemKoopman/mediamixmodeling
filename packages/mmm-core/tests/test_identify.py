"""Identifiability: the checks that catch a model which converged but learned nothing.

Every scenario here is one a converged sampler reports as healthy. R-hat is 1.00,
divergences are zero, the decomposition adds up — and the per-channel numbers are still
meaningless. That gap is exactly why these checks exist.
"""

from __future__ import annotations

import numpy as np
import pytest

from mmm_core.model.identify import (
    CONTRIBUTION_CORRELATION_UNIDENTIFIED,
    IDENTIFIED,
    NOT_IDENTIFIED,
    WEAK,
    assess_identifiability,
    contribution_correlations,
    overlap_coefficient,
    prior_effect_samples,
    prior_sensitivity_shift,
    relative_interval_width,
)


def _rng(seed: int = 0):
    return np.random.default_rng(seed)


# --- overlap coefficient ------------------------------------------------------------


def test_identical_distributions_overlap_almost_completely():
    rng = _rng()
    assert overlap_coefficient(rng.normal(0, 1, 20_000), rng.normal(0, 1, 20_000)) > 0.9


def test_disjoint_distributions_do_not_overlap():
    rng = _rng()
    assert overlap_coefficient(rng.normal(0, 1, 20_000), rng.normal(30, 1, 20_000)) < 0.01


def test_a_posterior_that_narrowed_still_overlaps_partially():
    rng = _rng()
    prior = rng.normal(0, 1, 20_000)
    posterior = rng.normal(0, 0.2, 20_000)   # the data tightened it a lot
    overlap = overlap_coefficient(prior, posterior)
    assert 0.05 < overlap < 0.5


def test_overlap_of_empty_samples_is_nan_not_a_crash():
    assert np.isnan(overlap_coefficient(np.array([]), np.array([1.0, 2.0])))


# --- interval width -----------------------------------------------------------------


def test_relative_width_of_a_tight_estimate_is_small():
    rng = _rng()
    assert relative_interval_width(rng.normal(100, 3, 10_000)) < 0.1


def test_relative_width_around_zero_is_infinite():
    rng = _rng()
    assert not np.isfinite(relative_interval_width(rng.normal(0, 1e-15, 100)))


# --- correlation between contributions ----------------------------------------------


def test_channels_traded_off_against_each_other_are_flagged():
    """The classic MMM failure: two channels always budgeted together.

    The posterior can move contribution from one to the other at no cost to the fit, so
    each individual number is arbitrary even though their sum is perfectly well determined.
    """
    rng = _rng()
    shared = rng.normal(100, 20, 4_000)
    contributions = {
        "search_brand": shared + rng.normal(0, 1, 4_000),
        "search_generic": 200 - shared + rng.normal(0, 1, 4_000),
        "tv": rng.normal(50, 5, 4_000),
    }
    report = assess_identifiability(contributions)
    assert report.channel("search_brand").verdict == NOT_IDENTIFIED
    assert report.channel("search_generic").verdict == NOT_IDENTIFIED
    assert report.channel("tv").verdict == IDENTIFIED
    assert set(report.unusable_channels) == {"search_brand", "search_generic"}
    # ... and they are reported as one inseparable group, because their SUM is fine.
    assert report.inseparable_groups == (("search_brand", "search_generic"),)


def test_independent_channels_are_identified():
    rng = _rng()
    contributions = {n: rng.normal(100, 5, 4_000) for n in ("a", "b", "c")}
    report = assess_identifiability(contributions)
    assert report.worst_verdict == IDENTIFIED
    assert report.inseparable_groups == ()
    assert report.unusable_channels == []


def test_correlation_sign_does_not_matter():
    rng = _rng()
    base = rng.normal(100, 20, 4_000)
    positive = {"a": base + rng.normal(0, 1, 4_000), "b": base + rng.normal(0, 1, 4_000)}
    corr = contribution_correlations(positive)
    assert abs(corr[("a", "b")]) >= CONTRIBUTION_CORRELATION_UNIDENTIFIED
    assert assess_identifiability(positive).channel("a").verdict == NOT_IDENTIFIED


def test_a_constant_contribution_does_not_blow_up_the_correlation():
    rng = _rng()
    contributions = {"a": np.full(1_000, 5.0), "b": rng.normal(10, 2, 1_000)}
    assert contribution_correlations(contributions)[("a", "b")] == 0.0


# --- prior-posterior overlap in context ---------------------------------------------


def test_a_posterior_identical_to_its_prior_is_not_identified():
    """Nothing was learned; the reported effect is the assumption, restated."""
    rng = _rng()
    prior = np.abs(rng.normal(0, 0.3, 8_000))
    report = assess_identifiability(
        {"ghost": rng.normal(100, 5, 8_000)},
        prior_samples={"ghost": prior},
        posterior_samples={"ghost": np.abs(rng.normal(0, 0.3, 8_000))},
    )
    ch = report.channel("ghost")
    assert ch.verdict == NOT_IDENTIFIED
    assert ch.prior_posterior_overlap > 0.9
    assert any("aanname" in r for r in ch.reasons)


def test_a_posterior_that_moved_away_from_its_prior_is_identified():
    rng = _rng()
    report = assess_identifiability(
        {"real": rng.normal(100, 5, 8_000)},
        prior_samples={"real": np.abs(rng.normal(0, 0.5, 8_000))},
        posterior_samples={"real": np.abs(rng.normal(2.0, 0.05, 8_000))},
    )
    assert report.channel("real").verdict == IDENTIFIED


def test_overlap_check_is_skipped_rather_than_guessed_when_samples_are_missing():
    rng = _rng()
    report = assess_identifiability({"a": rng.normal(100, 5, 1_000)})
    assert report.channel("a").prior_posterior_overlap is None
    assert report.channel("a").verdict == IDENTIFIED


# --- prior sensitivity ----------------------------------------------------------------


def test_a_channel_that_moves_when_priors_loosen_is_flagged():
    rng = _rng()
    report = assess_identifiability(
        {"a": rng.normal(100, 5, 2_000)},
        prior_sensitivity={"a": 0.6},
    )
    ch = report.channel("a")
    assert ch.verdict == NOT_IDENTIFIED
    assert any("ruimere aannames" in r for r in ch.reasons)


def test_a_stable_channel_survives_looser_priors():
    rng = _rng()
    report = assess_identifiability(
        {"a": rng.normal(100, 5, 2_000)}, prior_sensitivity={"a": 0.02}
    )
    assert report.channel("a").verdict == IDENTIFIED


def test_prior_sensitivity_is_relative_to_the_larger_share():
    # 2% -> 4% is a doubling, not "two points of nothing".
    shift = prior_sensitivity_shift({"a": 0.02}, {"a": 0.04})
    assert shift["a"] == pytest.approx(0.5)
    # A share that did not move at all reads as zero.
    assert prior_sensitivity_shift({"a": 0.3}, {"a": 0.3})["a"] == 0.0
    # Missing from the second fit -> simply absent, not silently zero.
    assert prior_sensitivity_shift({"a": 0.3}, {})== {}


# --- prior draws come from the config -------------------------------------------------


def test_prior_effect_samples_follow_the_configured_scale():
    from mmm_core.model import ChannelConfig, ChannelPriors, ModelConfig

    config = ModelConfig(
        kpi="rev",
        channels=(
            ChannelConfig("small", priors=ChannelPriors(beta_sigma=0.05)),
            ChannelConfig("big", priors=ChannelPriors(beta_sigma=0.5)),
        ),
    )
    draws = prior_effect_samples(config, n=20_000)
    assert draws["small"].std() < draws["big"].std()
    assert (draws["small"] >= 0).all()   # HalfNormal: media cannot hurt sales


# --- the escalation is monotone --------------------------------------------------------


def test_several_weak_signals_do_not_silently_cancel_out():
    rng = _rng()
    shared = rng.normal(100, 20, 4_000)
    report = assess_identifiability(
        {
            "a": shared + rng.normal(0, 15, 4_000),      # moderately correlated
            "b": shared + rng.normal(0, 15, 4_000),
        },
        prior_sensitivity={"a": 0.3, "b": 0.05},
    )
    # The worst signal wins; it is never averaged away by the good ones.
    assert report.channel("a").verdict in (WEAK, NOT_IDENTIFIED)
    assert len(report.channel("a").reasons) >= 1
