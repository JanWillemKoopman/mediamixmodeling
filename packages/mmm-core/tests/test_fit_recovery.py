"""End-to-end: fit the model on synthetic data and check it recovers ground truth.

Marked ``slow`` (real NUTS fits) and needs the ``[model]`` extra::

    pytest packages/mmm-core -m slow

This is the proof the whole package exists for: the statistical core scored against
datasets whose true contributions we know, not against itself.

Two things changed here in the refactor, and both matter:

1. **Configs are built the way production builds them** — measured statistics plus stated
   intent, through :func:`mmm_core.model.priors.build_model_config`. Hand-writing a config
   in the test would prove that some hand-picked priors work, which is not a claim anyone
   can act on.
2. **The suite is a matrix, not a single happy case.** The fixtures below are chosen to be
   the regimes the pre-refactor model got wrong: a channel that is nowhere near saturated,
   a strongly seasonal business whose media pressure peaks at the same time as demand, and
   two channels that always moved together. A model can look perfect on an easy dataset
   and be badly wrong on any of these.
"""

from __future__ import annotations

import json
import warnings

import numpy as np
import pytest

pytest.importorskip("pymc")
pytest.importorskip("numpyro")

import pandas as pd  # noqa: E402

from mmm_core.model import (  # noqa: E402
    ChannelDGP,
    ChannelIntent,
    ChannelRole,
    ChannelUnit,
    Carryover,
    KpiType,
    MediaShare,
    ModelIntent,
    SaturationBelief,
    SeasonalityBelief,
    build_model_config,
    measure_dataset,
    simulate_mmm,
)
from mmm_core.model.build import build_model  # noqa: E402
from mmm_core.model.fit import fit_model  # noqa: E402

# Small but honest sampling budget: enough draws for R-hat and a credible interval to
# mean something, few enough that the whole matrix stays runnable in CI.
SAMPLE = dict(draws=500, tune=500, chains=2, seed=0)


def _resolve(data: pd.DataFrame, channels: tuple[ChannelIntent, ...], **intent_kw):
    """Build the config exactly the way the product does: measure, then resolve intent."""
    names = [c.name for c in channels]
    stats = measure_dataset(data, "kpi", names)
    intent = ModelIntent(kpi="kpi", kpi_type=KpiType.REVENUE, channels=channels, **intent_kw)
    resolved = build_model_config(intent, stats)
    assert not resolved.has_errors, [i.message for i in resolved.errors]
    return resolved.config


def _fit(data: pd.DataFrame, config):
    warnings.filterwarnings("ignore")
    summary, idata = fit_model(data, config, **SAMPLE)
    built = build_model(data, config)  # cheap: builds the graph, no sampling
    return summary, built, idata


def _true_shares_over_observed_window(ds, burn_in: int) -> dict[str, float]:
    """Ground-truth contribution shares over the weeks the model was actually scored on.

    Comparing against shares computed over the *whole* file would be comparing two
    different quantities once burn-in is in play.
    """
    kpi = ds.data[ds.kpi_column].to_numpy(dtype=float)[burn_in:]
    total = float(kpi.sum())
    return {
        name: float(ds.contributions[name].to_numpy()[burn_in:].sum()) / total
        for name in ds.channel_names
    }


# ======================================================================================
# 1. Baseline: a well-behaved two-channel dataset
# ======================================================================================


@pytest.fixture(scope="module")
def baseline_fit():
    ds = simulate_mmm(
        [
            ChannelDGP("search", half_life=1.0, half_saturation=90.0, beta=2500.0),
            ChannelDGP("video", half_life=5.0, half_saturation=220.0, beta=1800.0, slope=1.4),
        ],
        n_weeks=104,
        noise_sd=120.0,
        seed=7,
    )
    config = _resolve(
        ds.data,
        (
            ChannelIntent("search", ChannelUnit.CURRENCY, role=ChannelRole.DEMAND_CAPTURE,
                          carryover=Carryover.SHORT),
            ChannelIntent("video", ChannelUnit.CURRENCY, role=ChannelRole.BRAND_BUILDING,
                          carryover=Carryover.LONG),
        ),
        seasonality=SeasonalityBelief.MILD,
    )
    return (ds, *_fit(ds.data, config))


@pytest.mark.slow
def test_model_fits_well(baseline_fit):
    _, summary, _, _ = baseline_fit
    d = summary.diagnostics
    assert d.r2 > 0.7
    assert d.decomposition_ok
    assert d.max_r_hat < 1.1


@pytest.mark.slow
def test_true_contribution_share_within_credible_interval(baseline_fit):
    ds, summary, built, _ = baseline_fit
    true_shares = _true_shares_over_observed_window(ds, built.burn_in)
    for ch in summary.channels:
        ci = ch.contribution_share
        assert ci.p3 <= true_shares[ch.name] <= ci.p97, (
            f"{ch.name}: true {true_shares[ch.name]:.3f} not in [{ci.p3:.3f}, {ci.p97:.3f}]"
        )


@pytest.mark.slow
def test_true_adstock_half_life_within_credible_interval(baseline_fit):
    ds, summary, _, _ = baseline_fit
    truth = {c.name: c.half_life for c in ds.channels}
    for ch in summary.channels:
        ci = ch.adstock_half_life_weeks
        assert ci.p3 <= truth[ch.name] <= ci.p97


@pytest.mark.slow
def test_predictive_coverage_is_reasonable(baseline_fit):
    _, summary, _, _ = baseline_fit
    d = summary.diagnostics
    # A 94% predictive interval should cover most weeks, and the narrower levels should
    # behave too — hitting 94% with one enormous interval is not calibration.
    assert 0.80 <= d.interval_coverage_94 <= 1.0
    assert 0.60 <= d.interval_coverage_80 <= 1.0
    assert d.interval_coverage_50 <= d.interval_coverage_80 <= d.interval_coverage_94


@pytest.mark.slow
def test_summary_is_json_serializable_without_nan(baseline_fit):
    _, summary, _, _ = baseline_fit
    blob = json.dumps(summary.to_json_dict())
    assert '"contribution_share"' in blob
    assert '"adstock_half_life_weeks"' in blob
    # A bare NaN is not valid JSON and used to destroy completed fits at the database.
    assert "NaN" not in blob and "Infinity" not in blob


@pytest.mark.slow
def test_burn_in_weeks_are_excluded_from_the_scored_window(baseline_fit):
    ds, summary, built, _ = baseline_fit
    assert built.burn_in > 0, "a five-week half-life channel should need a warm-up"
    assert summary.n_weeks == len(ds.data) - built.burn_in
    assert summary.weekly.burn_in_weeks == built.burn_in
    # The chart still shows every week; only the scoring window shrank.
    assert len(summary.weekly.dates) == len(ds.data)


# ======================================================================================
# 2. The unsaturated channel — the regime the old Beta(0,1) prior could not express
# ======================================================================================


@pytest.fixture(scope="module")
def unsaturated_fit():
    """A channel whose half-saturation point sits far above any spend ever observed.

    The pre-refactor prior put the half-saturation point on a Beta(0,1) of max-scaled
    spend, so it could not place that point above the historical maximum at all — the
    model was structurally incapable of representing this channel, and reported it as far
    more saturated than it was. That systematically understates marginal ROAS, which is
    the number budget decisions are actually made on.
    """
    ds = simulate_mmm(
        [
            # typical weekly spend ~100, half-saturation at 600: barely into the curve
            ChannelDGP("growth", half_life=2.0, half_saturation=600.0, beta=4000.0,
                       spend_base=100.0),
            ChannelDGP("mature", half_life=2.0, half_saturation=40.0, beta=1500.0,
                       spend_base=100.0),
        ],
        n_weeks=120,
        noise_sd=100.0,
        seed=13,
    )
    config = _resolve(
        ds.data,
        (
            ChannelIntent("growth", ChannelUnit.CURRENCY,
                          saturation=SaturationBelief.FAR_FROM_SATURATED),
            ChannelIntent("mature", ChannelUnit.CURRENCY,
                          saturation=SaturationBelief.LIKELY_SATURATED),
        ),
        seasonality=SeasonalityBelief.MILD,
    )
    return (ds, *_fit(ds.data, config))


@pytest.mark.slow
def test_unsaturated_channel_is_not_forced_to_look_saturated(unsaturated_fit):
    ds, summary, built, _ = unsaturated_fit
    growth = next(c for c in summary.channels if c.name == "growth")
    observed_max = float(built.spend[built.observed_slice, 0].max())
    # The honest answer is that half-saturation lies above anything we ever spent. The old
    # prior made that answer unreachable; the credible interval must now be able to reach it.
    assert growth.saturation_point.p97 > observed_max, (
        f"half-saturation interval tops out at {growth.saturation_point.p97:.0f} but the "
        f"channel never spent more than {observed_max:.0f} — the model cannot express "
        f"'not saturated yet'"
    )


@pytest.mark.slow
def test_marginal_roas_is_higher_for_the_unsaturated_channel(unsaturated_fit):
    _, summary, _, _ = unsaturated_fit
    curves = {c.name: c for c in summary.response_curves}
    growth = curves["growth"].marginal_roas_at_current.p50
    mature = curves["mature"].marginal_roas_at_current.p50
    # This is the whole point of getting saturation right: the next euro is worth more in
    # the channel with room to grow, and the model has to be able to say so.
    assert growth > mature


# ======================================================================================
# 3. Seasonal confounding — media pressure peaking with demand
# ======================================================================================


@pytest.fixture(scope="module")
def seasonal_fit():
    """A strongly seasonal business that also advertises seasonally.

    This is where a fixed seasonal prior silently hands the December peak to advertising:
    the seasonal term is too stiff to absorb the swing, media pressure happens to peak at
    the same time, and the model credits the peak to the campaign. Deriving the seasonal
    prior from the amplitude actually present in the KPI is what prevents that.
    """
    ds = simulate_mmm(
        [
            ChannelDGP("display", half_life=2.0, half_saturation=120.0, beta=1200.0,
                       spend_base=100.0, seasonal_spend_amplitude=0.6),
            ChannelDGP("email", half_life=1.0, half_saturation=80.0, beta=900.0,
                       spend_base=80.0, seasonal_spend_amplitude=0.6),
        ],
        n_weeks=156,
        intercept=6000.0,
        seasonal_amplitude=3000.0,   # a large, real seasonal swing in demand itself
        noise_sd=150.0,
        seed=23,
    )
    config = _resolve(
        ds.data,
        (
            ChannelIntent("display", ChannelUnit.CURRENCY),
            ChannelIntent("email", ChannelUnit.CURRENCY),
        ),
        seasonality=SeasonalityBelief.STRONG,
    )
    return (ds, *_fit(ds.data, config))


@pytest.mark.slow
def test_seasonal_demand_is_not_credited_to_media(seasonal_fit):
    ds, summary, built, _ = seasonal_fit
    true_shares = _true_shares_over_observed_window(ds, built.burn_in)
    true_media = sum(true_shares.values())
    estimated_media = sum(c.contribution_share.p50 for c in summary.channels)
    # The failure mode is over-attribution, so the ceiling is what matters: the model must
    # not claim materially more for media than media actually did.
    assert estimated_media < true_media + 0.15, (
        f"media credited with {estimated_media:.1%} of the KPI against a true "
        f"{true_media:.1%} — the seasonal peak is leaking into the channels"
    )


@pytest.mark.slow
def test_the_seasonal_term_actually_absorbs_the_swing(seasonal_fit):
    _, summary, _, _ = seasonal_fit
    season = summary.baseline_decomposition.components["seizoen"]
    swing = max(season) - min(season)
    # The simulated demand swing is +/-3000, i.e. a 6000 peak-to-trough. The seasonal term
    # has to have room to represent most of it, or something else will.
    assert swing > 3000, f"seasonal component only spans {swing:.0f} of a ~6000 true swing"


# ======================================================================================
# 4. Collinear channels — the model must admit it cannot separate them
# ======================================================================================


@pytest.fixture(scope="module")
def collinear_fit():
    """Two channels that were always budgeted together.

    Every sampler diagnostic comes back clean here: R-hat is fine, there are no
    divergences, the decomposition adds up. The per-channel split is nevertheless
    arbitrary, and the pre-refactor quality gate had no check that could notice.
    """
    n = 130
    rng = np.random.default_rng(5)
    driver = np.exp(np.log(100.0) + np.cumsum(rng.normal(0, 0.25, n)) * 0.15)
    ds = simulate_mmm(
        [
            ChannelDGP("brand_search", half_life=1.0, half_saturation=90.0, beta=1500.0,
                       spend=driver),
            # the same budget, moved by the same hand, plus a whisper of noise
            ChannelDGP("generic_search", half_life=1.0, half_saturation=90.0, beta=1500.0,
                       spend=driver * 0.8 + rng.normal(0, 1.0, n)),
        ],
        n_weeks=n,
        noise_sd=120.0,
        seed=31,
    )
    config = _resolve(
        ds.data,
        (
            ChannelIntent("brand_search", ChannelUnit.CURRENCY),
            ChannelIntent("generic_search", ChannelUnit.CURRENCY),
        ),
        seasonality=SeasonalityBelief.MILD,
    )
    return (ds, *_fit(ds.data, config))


@pytest.mark.slow
def test_collinear_channels_are_reported_as_inseparable(collinear_fit):
    """Read the verdict the product actually produces, not a re-derivation of it.

    `summarize_fit` assesses identifiability with the prior draws in hand, so it can also
    see that the split between these two is coming from the prior rather than the data —
    a re-derivation from the posterior alone misses that.
    """
    _, summary, _, _ = collinear_fit
    by_name = {c.name: c for c in summary.identifiability}
    assert set(by_name) == {"brand_search", "generic_search"}
    for name, ci in by_name.items():
        assert ci.verdict != "identified", (
            f"{name} was reported as separately measurable, but it and the other channel "
            f"were driven by the same budget (correlation "
            f"{ci.max_contribution_correlation:+.2f})"
        )
        assert ci.reasons, f"{name} was flagged without telling the user why"


@pytest.mark.slow
def test_collinear_channels_do_not_earn_budget_advice(collinear_fit):
    """The consequence of the previous test, which is what actually protects the user."""
    from mmm_core.model.validate import Output, ValidationLevel

    _, summary, _, _ = collinear_fit
    assert summary.validation is not None
    assert summary.validation.level < ValidationLevel.USABLE_FOR_DECISIONS
    assert not summary.validation.allows(Output.BUDGET_ADVICE)
    assert summary.optimal_allocation is None


@pytest.mark.slow
def test_collinear_fit_still_looks_healthy_to_the_sampler(collinear_fit):
    """The point of the previous test: convergence diagnostics cannot catch this."""
    _, summary, _, _ = collinear_fit
    d = summary.diagnostics
    assert d.max_r_hat < 1.1
    assert d.decomposition_ok


# ======================================================================================
# 5. Count KPI (leads) through the log link
# ======================================================================================


@pytest.mark.slow
def test_count_likelihood_fits_and_decomposes():
    from mmm_core.transforms import alpha_from_half_life, geometric_adstock, hill_saturation

    rng = np.random.default_rng(3)
    n = 120
    idx = pd.date_range("2023-01-02", periods=n, freq="7D", name="week_start")

    def spend(base, seed):
        r = np.random.default_rng(seed)
        s = np.exp(np.log(base) + np.cumsum(r.normal(0, 0.3, n)) * 0.1)
        return np.maximum(s * (1 + (r.random(n) < 0.1) * r.uniform(0.3, 1.0, n)), 0.0)

    def effect(sp, hl, hs, beta):
        ad = geometric_adstock(sp, alpha_from_half_life(hl), 12, True)
        return beta * hill_saturation(ad / ad.max(), hs, 1.0)

    s_search, s_social = spend(100, 1), spend(80, 2)
    log_mu = (
        np.log(20.0) + 0.003 * np.arange(n) + 0.15 * np.sin(2 * np.pi * np.arange(n) / 52)
        + effect(s_search, 1.0, 0.4, 0.5) + effect(s_social, 3.0, 0.5, 0.35)
    )
    leads = rng.poisson(np.exp(log_mu)).astype(float)
    data = pd.DataFrame({"leads": leads, "search": s_search, "social": s_social}, index=idx)

    stats = measure_dataset(data, "leads", ["search", "social"])
    intent = ModelIntent(
        kpi="leads",
        kpi_type=KpiType.LEADS,
        channels=(
            ChannelIntent("search", ChannelUnit.CURRENCY, carryover=Carryover.SHORT),
            ChannelIntent("social", ChannelUnit.CURRENCY, carryover=Carryover.MEDIUM),
        ),
        seasonality=SeasonalityBelief.MILD,
    )
    resolved = build_model_config(intent, stats)
    assert not resolved.has_errors, [i.message for i in resolved.errors]
    config = resolved.config
    # A small integer KPI must not be modelled as continuous money.
    assert config.likelihood.is_count

    warnings.filterwarnings("ignore")
    summary, _ = fit_model(data, config, **SAMPLE)
    assert summary.diagnostics.decomposition_ok
    assert summary.diagnostics.max_r_hat < 1.1
    blob = json.dumps(summary.to_json_dict())
    assert "NaN" not in blob


# ======================================================================================
# 6. Non-currency channels stay out of the budget optimiser
# ======================================================================================


@pytest.mark.slow
def test_grp_channel_is_excluded_from_budget_reallocation():
    """You cannot move a euro into a GRP.

    The pre-refactor optimiser summed every channel's average pressure into one "total
    weekly budget" and redistributed it, which for a mixed-unit model produces a confident
    recommendation denominated in nothing at all.
    """
    ds = simulate_mmm(
        [
            ChannelDGP("tv_grp", half_life=4.0, half_saturation=150.0, beta=2000.0),
            ChannelDGP("search", half_life=1.0, half_saturation=90.0, beta=1800.0),
        ],
        n_weeks=110,
        noise_sd=120.0,
        seed=41,
    )
    config = _resolve(
        ds.data,
        (
            ChannelIntent("tv_grp", ChannelUnit.GRP, role=ChannelRole.BRAND_BUILDING),
            ChannelIntent("search", ChannelUnit.CURRENCY, role=ChannelRole.DEMAND_CAPTURE),
        ),
        seasonality=SeasonalityBelief.MILD,
    )
    summary, _, _ = _fit(ds.data, config)

    alloc = summary.optimal_allocation
    assert alloc is not None
    assert set(alloc.per_channel) == {"search"}
    assert alloc.fixed_channels == ["tv_grp"]
    # Both channels still get a response curve — the GRP channel is modelled, just not
    # traded against euros.
    assert {c.name for c in summary.response_curves} == {"tv_grp", "search"}
    # And the reported unit travels with the result, so the UI can word it correctly.
    units = {c.name: c.unit for c in summary.channels}
    assert units == {"tv_grp": "grp", "search": "currency"}
