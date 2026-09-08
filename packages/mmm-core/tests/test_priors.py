"""The prior builder: does the model start from a belief the data could ever produce?

These are the regression tests for the single most consequential defect the audit found.
The pre-refactor model centred the intercept on the median KPI — as if marketing did
nothing — and then added a strictly non-negative HalfNormal(0.5) per channel on top. Since
those effects can only add, the prior-predictive KPI grew with every channel:

    channels   prior mean KPI (observed max = 1)   P(prior > observed max)
    1          0.81                                25%
    5          1.65                                93%
    8          2.28                                ~100%

A model that starts by expecting twice the KPI that was ever observed resolves the
contradiction by pushing the intercept down, and part of that correction lands on the
media coefficients — systematically over-crediting advertising in every result.

`test_prior_media_share_is_stable_across_channel_counts` below is the test that fails on
the old design and passes on the new one. Everything else here pins the reasoning that
makes it hold.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from mmm_core.model import (
    AdstockType,
    ChannelIntent,
    ChannelRole,
    ChannelUnit,
    Carryover,
    KpiType,
    LikelihoodType,
    MediaShare,
    ModelIntent,
    SaturationBelief,
    SeasonalityBelief,
    Strength,
    build_model_config,
    measure_dataset,
    required_burn_in,
    widen_priors,
)
from mmm_core.model.config import ChannelConfig, SaturationType
from mmm_core.model.intent import media_share_center
from mmm_core.model.priors import MIN_WEEKS_FOR_SEASONALITY

_HALFNORMAL_MEAN = math.sqrt(2.0 / math.pi)


def _dataset(n_channels: int, n_weeks: int = 156, seed: int = 0, seasonal: float = 0.0):
    """A plausible weekly dataset with `n_channels` channels and a real baseline."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2022-01-03", periods=n_weeks, freq="7D", name="week_start")
    t = np.arange(n_weeks)
    cols: dict[str, np.ndarray] = {}
    kpi = 100_000.0 + 50.0 * t + seasonal * np.sin(2 * np.pi * t / 52.0)
    for i in range(n_channels):
        spend = np.abs(rng.normal(5_000, 1_500, n_weeks)) + 500
        cols[f"ch{i}"] = spend
        kpi = kpi + 2.0 * spend
    kpi = kpi + rng.normal(0, 2_000, n_weeks)
    return pd.DataFrame({"rev": kpi, **cols}, index=idx)


def _intent(n_channels: int, **kw) -> ModelIntent:
    return ModelIntent(
        kpi="rev",
        kpi_type=KpiType.REVENUE,
        channels=tuple(
            ChannelIntent(f"ch{i}", ChannelUnit.CURRENCY) for i in range(n_channels)
        ),
        **kw,
    )


def _resolve(n_channels: int, n_weeks: int = 156, seasonal: float = 0.0, **kw):
    data = _dataset(n_channels, n_weeks=n_weeks, seasonal=seasonal)
    stats = measure_dataset(data, "rev", [f"ch{i}" for i in range(n_channels)])
    resolved = build_model_config(_intent(n_channels, **kw), stats)
    assert not resolved.has_errors, [i.message for i in resolved.errors]
    return data, stats, resolved


def _expected_prior_media_share(config, stats) -> float:
    """Prior-expected media share, computed analytically from the resolved config.

    For a HalfNormal(s), E[beta] = s * sqrt(2/pi). Evaluated at the channel's own typical
    (median) weekly pressure, with the Hill half-saturation centred at `m x median` and a
    slope prior centred on 1, the saturation is exactly 1 / (1 + m). So the expected media
    contribution is available in closed form — no sampling required.
    """
    media = 0.0
    for ch in config.channels:
        median_scaled = stats.channel(ch.name).median_scaled
        mult = ch.priors.halfsat_log_center / median_scaled
        expected_sat = 1.0 / (1.0 + mult)
        media += ch.priors.beta_sigma * _HALFNORMAL_MEAN * expected_sat
    baseline = config.priors.intercept_mu
    return media / (baseline + media)


# --- the regression test ----------------------------------------------------------


@pytest.mark.parametrize("n_channels", [1, 2, 3, 5, 8, 12])
def test_prior_media_share_is_stable_across_channel_counts(n_channels):
    """Adding channels must split the media budget, never inflate it.

    This is the property the old design lacked. There, every extra channel added another
    HalfNormal(0.5) of expected contribution on top of an intercept that already accounted
    for the whole KPI, so the prior-expected media share climbed past 100% and kept going.
    """
    _, stats, resolved = _resolve(n_channels)
    share = _expected_prior_media_share(resolved.config, stats)
    assert share == pytest.approx(media_share_center(None), abs=0.02), (
        f"{n_channels} channels imply a prior media share of {share:.1%}, which should "
        f"stay at the stated {media_share_center(None):.0%} regardless of channel count"
    )


def _prior_predictive_kpi(config, stats, n_draws: int = 60_000) -> np.ndarray:
    """Monte-Carlo the resolved priors into an implied KPI, on the model's 0-1 axis.

    Draws beta / half-saturation / slope from exactly the priors the builder produced and
    evaluates each channel at its own typical (median) weekly pressure. The KPI is scaled
    so the highest week ever observed is exactly 1.0.
    """
    rng = np.random.default_rng(0)
    total = rng.normal(config.priors.intercept_mu, config.priors.intercept_sigma, n_draws)
    for ch in config.channels:
        median_scaled = stats.channel(ch.name).median_scaled
        beta = np.abs(rng.normal(0.0, ch.priors.beta_sigma, n_draws))
        halfsat = rng.lognormal(
            math.log(ch.priors.halfsat_log_center), ch.priors.halfsat_log_sigma, n_draws
        )
        slope = rng.gamma(ch.priors.hill_slope_a, 1.0 / ch.priors.hill_slope_b, n_draws)
        total = total + beta * (
            median_scaled**slope / (halfsat**slope + median_scaled**slope)
        )
    return total


def test_prior_predictive_kpi_does_not_grow_with_the_number_of_channels():
    """The audit measurement, as a test.

    On the old defaults the prior-expected KPI climbed from 0.81 (one channel) to 2.28
    (eight) on an axis where the highest observed week is 1.0 — so the model started out
    expecting more than twice the KPI that had ever happened, and every extra channel made
    it worse. What matters is not one number but the *slope*: adding channels must leave
    the implied KPI where it was.
    """
    means = {}
    for n_channels in (1, 2, 3, 5, 8, 12):
        _, stats, resolved = _resolve(n_channels)
        means[n_channels] = float(
            _prior_predictive_kpi(resolved.config, stats).mean()
        )

    spread = max(means.values()) - min(means.values())
    assert spread < 0.05, (
        f"the prior-implied KPI moves by {spread:.2f} across 1-12 channels: {means}. It "
        f"must stay flat — a prior that grows with the model's size is the defect this "
        f"module exists to prevent."
    )
    # And it must sit near the observed level rather than above it.
    for n_channels, mean in means.items():
        assert 0.5 < mean < 1.05, f"{n_channels} channels imply a prior mean KPI of {mean:.2f}"


@pytest.mark.parametrize("n_channels", [1, 3, 5, 8, 12])
def test_prior_is_not_absurdly_wide(n_channels):
    """Admitting a bit more than was observed is right; expecting half again as much is not.

    A prior centred on the median KPI necessarily puts some mass above the single highest
    observed week — that is arithmetic, not a fault, and a prior that could not exceed the
    observed maximum would be fighting the data instead of informing it. What would be
    wrong is mass far beyond it.
    """
    _, stats, resolved = _resolve(n_channels)
    total = _prior_predictive_kpi(resolved.config, stats)
    assert float(np.mean(total > 1.5)) < 0.05
    assert float(np.mean(total > 3.0)) < 0.001
    # The prior must also admit the low end, or it cannot explain a quiet week.
    assert float(np.mean(total < stats.kpi_median_scaled)) > 0.2


# --- saturation: the model must be able to say "not saturated yet" ----------------


def test_half_saturation_prior_can_exceed_the_historical_maximum():
    """A Beta(0,1) prior on max-scaled spend cannot represent an unsaturated channel.

    That cap is what made every marginal ROAS look worse than it was, and it is why the
    optimiser kept recommending flattening spend instead of scaling up. A LogNormal has no
    such ceiling.
    """
    data = _dataset(1)
    stats = measure_dataset(data, "rev", ["ch0"])
    intent = ModelIntent(
        kpi="rev",
        kpi_type=KpiType.REVENUE,
        channels=(
            ChannelIntent(
                "ch0", ChannelUnit.CURRENCY, saturation=SaturationBelief.FAR_FROM_SATURATED
            ),
        ),
    )
    config = build_model_config(intent, stats).config
    priors = config.channels[0].priors

    rng = np.random.default_rng(0)
    draws = rng.lognormal(math.log(priors.halfsat_log_center), priors.halfsat_log_sigma, 50_000)
    # "Above 1.0" means: half-saturation is not reached even at the highest weekly spend
    # ever observed — the honest description of a channel with room to grow.
    assert float(np.mean(draws > 1.0)) > 0.2


def test_saturation_belief_moves_the_half_saturation_point():
    data = _dataset(1)
    stats = measure_dataset(data, "rev", ["ch0"])
    centers = {}
    for belief in (
        SaturationBelief.LIKELY_SATURATED,
        SaturationBelief.APPROACHING,
        SaturationBelief.FAR_FROM_SATURATED,
    ):
        intent = ModelIntent(
            kpi="rev",
            kpi_type=KpiType.REVENUE,
            channels=(ChannelIntent("ch0", ChannelUnit.CURRENCY, saturation=belief),),
        )
        centers[belief] = build_model_config(intent, stats).config.channels[0].priors.halfsat_log_center
    assert (
        centers[SaturationBelief.LIKELY_SATURATED]
        < centers[SaturationBelief.APPROACHING]
        < centers[SaturationBelief.FAR_FROM_SATURATED]
    )


# --- seasonality is measured, not assumed -----------------------------------------


def test_season_prior_scales_with_the_seasonality_actually_in_the_data():
    """A fixed seasonal prior is how media ends up owning the December peak.

    On a strongly seasonal business the seasonal term has to be free enough to absorb the
    swing; if it is not, and media pressure peaks at the same time, the model attributes
    the peak to advertising.
    """
    flat = _resolve(3, seasonal=0.0)[2].config
    seasonal = _resolve(3, seasonal=60_000.0)[2].config
    assert seasonal.priors.season_sigma > 5 * flat.priors.season_sigma


def test_seasonality_is_dropped_when_the_window_is_too_short_to_identify_it():
    _, _, resolved = _resolve(2, n_weeks=40)
    assert resolved.config.seasonality_periods is None
    codes = {i.code for i in resolved.issues}
    assert "seasonality_unidentifiable" in codes
    warning = next(i for i in resolved.issues if i.code == "seasonality_unidentifiable")
    # The user has to be told what the consequence is, not just that a switch was flipped.
    assert "marketingkanalen" in warning.message


def test_seasonality_off_on_request():
    _, _, resolved = _resolve(2, seasonality=SeasonalityBelief.NONE)
    assert resolved.config.seasonality_periods is None


# --- likelihood follows from what the KPI is --------------------------------------


def test_small_integer_counts_get_a_count_likelihood():
    rng = np.random.default_rng(1)
    n = 120
    idx = pd.date_range("2022-01-03", periods=n, freq="7D", name="week_start")
    spend = np.abs(rng.normal(2_000, 500, n)) + 100
    leads = rng.poisson(12, n).astype(float)
    data = pd.DataFrame({"leads": leads, "ch0": spend}, index=idx)
    stats = measure_dataset(data, "leads", ["ch0"])
    intent = ModelIntent(
        kpi="leads", kpi_type=KpiType.LEADS,
        channels=(ChannelIntent("ch0", ChannelUnit.CURRENCY),),
    )
    resolved = build_model_config(intent, stats)
    assert resolved.config.likelihood is LikelihoodType.NEGATIVE_BINOMIAL


def test_continuous_revenue_gets_a_normal_likelihood():
    _, _, resolved = _resolve(2)
    assert resolved.config.likelihood is LikelihoodType.NORMAL


def test_count_beta_prior_is_in_log_space_not_kpi_space():
    """A log-link channel effect must not be scaled by the median KPI.

    Reusing the additive target under a log link would multiply every media effect by the
    median KPI, so a channel expected to add 10% would instead be given a prior implying
    e^(0.1 x median) — astronomically large.
    """
    rng = np.random.default_rng(2)
    n = 120
    idx = pd.date_range("2022-01-03", periods=n, freq="7D", name="week_start")
    data = pd.DataFrame(
        {
            "leads": rng.poisson(20, n).astype(float),
            "ch0": np.abs(rng.normal(2_000, 500, n)) + 100,
        },
        index=idx,
    )
    stats = measure_dataset(data, "leads", ["ch0"])
    intent = ModelIntent(
        kpi="leads", kpi_type=KpiType.LEADS,
        channels=(ChannelIntent("ch0", ChannelUnit.CURRENCY),),
    )
    config = build_model_config(intent, stats).config
    assert config.likelihood.is_count
    # -log(1 - 0.30) = 0.357 of log-space effect, divided by E[HalfNormal] x E[saturation].
    assert 0.1 < config.channels[0].priors.beta_sigma < 5.0


# --- intent maps to model shape ---------------------------------------------------


def test_brand_building_gets_delayed_adstock_and_a_longer_half_life():
    data = _dataset(2)
    stats = measure_dataset(data, "rev", ["ch0", "ch1"])
    intent = ModelIntent(
        kpi="rev",
        kpi_type=KpiType.REVENUE,
        channels=(
            ChannelIntent("ch0", ChannelUnit.CURRENCY, role=ChannelRole.BRAND_BUILDING,
                          carryover=Carryover.LONG),
            ChannelIntent("ch1", ChannelUnit.CURRENCY, role=ChannelRole.DEMAND_CAPTURE,
                          carryover=Carryover.SHORT),
        ),
    )
    config = build_model_config(intent, stats).config
    brand, capture = config.channels
    assert brand.adstock is AdstockType.DELAYED
    assert capture.adstock is AdstockType.GEOMETRIC
    assert brand.expected_half_life > capture.expected_half_life


def test_strength_splits_the_media_budget_proportionally():
    data = _dataset(2)
    stats = measure_dataset(data, "rev", ["ch0", "ch1"])
    intent = ModelIntent(
        kpi="rev",
        kpi_type=KpiType.REVENUE,
        channels=(
            ChannelIntent("ch0", ChannelUnit.CURRENCY, strength=Strength.LARGE),
            ChannelIntent("ch1", ChannelUnit.CURRENCY, strength=Strength.SMALL),
        ),
    )
    config = build_model_config(intent, stats).config
    big, small = config.channels
    # LARGE weighs 2.0, SMALL weighs 0.5 -> a four-to-one split of the same total budget.
    assert big.priors.beta_sigma == pytest.approx(4 * small.priors.beta_sigma, rel=0.01)


def test_media_share_belief_moves_the_baseline():
    small = _resolve(3, media_share_belief=MediaShare.SMALL)[2].config
    dominant = _resolve(3, media_share_belief=MediaShare.DOMINANT)[2].config
    assert small.priors.intercept_mu > dominant.priors.intercept_mu
    assert dominant.channels[0].priors.beta_sigma > small.channels[0].priors.beta_sigma


def test_unit_is_carried_through_to_the_config():
    data = _dataset(2)
    stats = measure_dataset(data, "rev", ["ch0", "ch1"])
    intent = ModelIntent(
        kpi="rev",
        kpi_type=KpiType.REVENUE,
        channels=(
            ChannelIntent("ch0", ChannelUnit.GRP),
            ChannelIntent("ch1", ChannelUnit.CURRENCY),
        ),
    )
    config = build_model_config(intent, stats).config
    assert config.monetary_channel_names == ["ch1"]


# --- blocking issues --------------------------------------------------------------


def test_a_channel_with_no_variation_is_a_blocking_error():
    data = _dataset(2)
    data["ch1"] = 1_000.0  # never moves
    stats = measure_dataset(data, "rev", ["ch0", "ch1"])
    resolved = build_model_config(_intent(2), stats)
    assert resolved.config is None
    assert resolved.has_errors
    msg = resolved.errors[0].message
    # The message has to say what the user should do, not just that something is wrong.
    assert "ch1" in msg and "aanname" in msg


def test_too_many_channels_for_the_window_is_a_blocking_error():
    data = _dataset(12, n_weeks=30)
    stats = measure_dataset(data, "rev", [f"ch{i}" for i in range(12)])
    resolved = build_model_config(_intent(12), stats)
    assert resolved.config is None
    assert any(i.code == "too_many_channels" for i in resolved.errors)


def test_unknown_channel_is_a_blocking_error():
    data = _dataset(1)
    stats = measure_dataset(data, "rev", ["ch0"])
    intent = ModelIntent(
        kpi="rev", kpi_type=KpiType.REVENUE,
        channels=(ChannelIntent("does_not_exist", ChannelUnit.CURRENCY),),
    )
    resolved = build_model_config(intent, stats)
    assert resolved.config is None
    assert any(i.code == "unknown_channel" for i in resolved.errors)


# --- adstock warm-up ---------------------------------------------------------------


def test_burn_in_grows_with_the_carry_over():
    short = ChannelConfig("a", expected_half_life=0.5)
    long = ChannelConfig("b", expected_half_life=6.0)
    assert required_burn_in(short) < required_burn_in(long)


def test_burn_in_never_eats_more_than_a_fifth_of_the_window():
    _, _, resolved = _resolve(2, n_weeks=60)
    assert resolved.config.burn_in_weeks <= 12


def test_burn_in_is_reported_to_the_user():
    data = _dataset(1)
    stats = measure_dataset(data, "rev", ["ch0"])
    intent = ModelIntent(
        kpi="rev", kpi_type=KpiType.REVENUE,
        channels=(ChannelIntent("ch0", ChannelUnit.CURRENCY, carryover=Carryover.LONG),),
    )
    resolved = build_model_config(intent, stats)
    assert resolved.config.burn_in_weeks > 0
    assert any(i.code == "burn_in_applied" for i in resolved.issues)


# --- provenance and reproducibility ------------------------------------------------


def test_every_derived_prior_carries_an_explanation():
    _, _, resolved = _resolve(3)
    assert resolved.provenance
    for p in resolved.provenance:
        assert p.derived_from.strip(), f"{p.parameter} has no explanation"


def test_resolution_is_deterministic():
    a = _resolve(4)[2].config
    b = _resolve(4)[2].config
    assert a == b


def test_widen_priors_loosens_every_scale():
    _, _, resolved = _resolve(3)
    tight = resolved.config
    loose = widen_priors(tight, 2.0)
    assert loose.priors.intercept_sigma == pytest.approx(2 * tight.priors.intercept_sigma)
    assert loose.priors.noise_sigma == pytest.approx(2 * tight.priors.noise_sigma)
    for a, b in zip(tight.channels, loose.channels):
        assert b.priors.beta_sigma == pytest.approx(2 * a.priors.beta_sigma)
        assert b.priors.halfsat_log_sigma == pytest.approx(2 * a.priors.halfsat_log_sigma)
    # The model shape itself must be untouched, or the comparison is meaningless.
    assert [c.name for c in loose.channels] == [c.name for c in tight.channels]
    assert loose.likelihood is tight.likelihood
    assert loose.burn_in_weeks == tight.burn_in_weeks


def test_short_windows_prefer_the_single_parameter_saturation():
    # Hill's extra shape parameter on thin data is what produces implausible S-curves and,
    # through them, absurd marginal-ROAS claims.
    _, _, resolved = _resolve(2, n_weeks=MIN_WEEKS_FOR_SEASONALITY - 10)
    assert all(c.saturation is SaturationType.LOGISTIC for c in resolved.config.channels)
