import dataclasses

import pytest

from mmm_core.model import (
    AdstockType,
    BaselinePriors,
    ChannelConfig,
    ChannelPriors,
    ChannelType,
    ChannelUnit,
    KpiType,
    LikelihoodType,
    ModelConfig,
    RoasCalibration,
    SaturationType,
)


# --- shape defaults --------------------------------------------------------------
# Prior *values* are deliberately not pinned here: they are derived per dataset by
# mmm_core.model.priors, and the defaults on these dataclasses exist only so the objects
# are constructible in tests. Pinning them would enshrine the very numbers the refactor
# replaced. What is pinned is the *shape* of the model a bare config describes.


def test_channel_defaults_reproduce_original_model_shape():
    ch = ChannelConfig("google")
    assert ch.adstock is AdstockType.GEOMETRIC
    assert ch.saturation is SaturationType.HILL
    assert ch.channel_type is ChannelType.GENERIC
    assert ch.unit is ChannelUnit.CURRENCY
    assert ch.l_max == 12


def test_model_defaults_reproduce_original_model_shape():
    m = ModelConfig(kpi="rev", channels=(ChannelConfig("g"),))
    assert m.likelihood is LikelihoodType.NORMAL
    assert m.kpi_type is KpiType.REVENUE
    assert m.add_trend is True
    assert m.seasonality_periods == 52.0
    assert m.n_fourier_modes == 2
    assert m.burn_in_weeks == 0


def test_prior_dataclasses_reject_impossible_scales():
    # Every scale is a standard deviation or a concentration: zero or negative is not a
    # loose prior, it is an invalid distribution.
    for kwargs in (
        {"beta_sigma": 0.0},
        {"beta_sigma": -1.0},
        {"halfsat_log_center": 0.0},
        {"halfsat_log_sigma": 0.0},
        {"adstock_concentration": 0.0},
        {"hill_slope_a": 0.0},
    ):
        with pytest.raises(ValueError):
            ChannelPriors(**kwargs)
    for kwargs in ({"intercept_sigma": 0.0}, {"noise_sigma": -0.1}, {"season_sigma": -1.0}):
        with pytest.raises(ValueError):
            BaselinePriors(**kwargs)


def test_intercept_mu_defaults_to_unset():
    # None means "build.py falls back to the scaled median". Every config that came out of
    # the prior builder sets it explicitly to the baseline share instead.
    assert BaselinePriors().intercept_mu is None


# --- validation ------------------------------------------------------------------

def test_student_t_nu_must_exceed_two():
    with pytest.raises(ValueError):
        ModelConfig(
            kpi="rev",
            channels=(ChannelConfig("g"),),
            likelihood=LikelihoodType.STUDENT_T,
            student_t_nu=2.0,
        )


def test_student_t_nu_above_two_is_accepted():
    m = ModelConfig(
        kpi="rev",
        channels=(ChannelConfig("g"),),
        likelihood=LikelihoodType.STUDENT_T,
        student_t_nu=4.0,
    )
    assert m.likelihood is LikelihoodType.STUDENT_T


def test_duplicate_channel_names_raise():
    with pytest.raises(ValueError):
        ModelConfig(kpi="rev", channels=(ChannelConfig("g"), ChannelConfig("g")))


def test_no_channels_raises():
    with pytest.raises(ValueError):
        ModelConfig(kpi="rev", channels=())


# --- per-channel priors are independent ------------------------------------------

def test_channels_get_independent_prior_objects():
    a = ChannelConfig("a")
    b = ChannelConfig("b", priors=ChannelPriors(beta_sigma=0.123))
    assert a.priors.beta_sigma != 0.123
    assert b.priors.beta_sigma == 0.123


def test_config_is_frozen():
    ch = ChannelConfig("a")
    with pytest.raises(dataclasses.FrozenInstanceError):
        ch.l_max = 6  # type: ignore[misc]


# --- roas calibration ------------------------------------------------------------

def test_calibration_defaults_to_none():
    assert ChannelConfig("a").calibration is None


def test_calibration_validates_inputs():
    with pytest.raises(ValueError):
        RoasCalibration(roas=-1.0, sd=0.5)
    with pytest.raises(ValueError):
        RoasCalibration(roas=2.0, sd=0.0)


def test_calibration_attaches_to_channel():
    ch = ChannelConfig("a", calibration=RoasCalibration(roas=3.0, sd=0.5))
    assert ch.calibration.roas == 3.0


# --- role and unit hygiene --------------------------------------------------------
# ChannelType and ChannelUnit are both str enums, so Python happily accepts one where the
# other belongs. That mistake is invisible until a "GRP" channel turns up in a euro budget
# optimisation, so the config refuses it at construction time.


def test_channel_type_and_unit_are_not_interchangeable():
    with pytest.raises(TypeError):
        ChannelConfig("g", ChannelUnit.GRP)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        ChannelConfig("g", unit=ChannelType.BRAND)  # type: ignore[arg-type]


def test_a_column_cannot_be_both_channel_and_control():
    with pytest.raises(ValueError, match="only play one role"):
        ModelConfig(kpi="rev", channels=(ChannelConfig("tv"),), control_columns=("tv",))


def test_the_kpi_cannot_also_be_a_predictor():
    with pytest.raises(ValueError, match="may not also be"):
        ModelConfig(kpi="tv", channels=(ChannelConfig("tv"),))


def test_count_likelihood_is_refused_for_a_revenue_kpi():
    # A Poisson on continuous money is silently wrong: it never fails to converge, it just
    # answers a different question.
    with pytest.raises(ValueError, match="counts whole units"):
        ModelConfig(
            kpi="rev",
            channels=(ChannelConfig("g"),),
            kpi_type=KpiType.REVENUE,
            likelihood=LikelihoodType.POISSON,
        )


def test_monetary_channel_names_excludes_non_currency_channels():
    m = ModelConfig(
        kpi="rev",
        channels=(
            ChannelConfig("tv", unit=ChannelUnit.GRP),
            ChannelConfig("search", unit=ChannelUnit.CURRENCY),
        ),
    )
    assert m.channel_names == ["tv", "search"]
    assert m.monetary_channel_names == ["search"]


def test_calibration_is_refused_on_a_non_currency_channel():
    # "Return per GRP" is a number; "return on ad spend" is not, and a ROAS calibration
    # would be silently comparing incompatible units.
    with pytest.raises(ValueError, match="currency channel"):
        ChannelConfig("tv", unit=ChannelUnit.GRP, calibration=RoasCalibration(3.0, 0.5))
