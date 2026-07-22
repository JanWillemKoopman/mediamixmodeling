import dataclasses

import pytest

from mmm_core.model import (
    AdstockType,
    BaselinePriors,
    ChannelConfig,
    ChannelPriors,
    ChannelType,
    LikelihoodType,
    ModelConfig,
    RoasCalibration,
    SaturationType,
)


# --- backward-compatible defaults ------------------------------------------------

def test_channel_defaults_reproduce_original_model():
    ch = ChannelConfig("google")
    assert ch.adstock is AdstockType.GEOMETRIC
    assert ch.saturation is SaturationType.HILL
    assert ch.channel_type is ChannelType.GENERIC
    assert ch.l_max == 12


def test_model_defaults_reproduce_original_model():
    m = ModelConfig(kpi="rev", channels=(ChannelConfig("g"),))
    assert m.likelihood is LikelihoodType.NORMAL
    assert m.add_trend is True
    assert m.seasonality_periods == 52.0
    assert m.n_fourier_modes == 2


def test_default_channel_priors_match_original_hardcoded_values():
    p = ChannelPriors()
    assert p.beta_sigma == 0.5
    assert p.adstock_concentration == 20.0
    assert (p.halfsat_a, p.halfsat_b) == (2.0, 2.0)
    assert (p.hill_slope_a, p.hill_slope_b) == (3.0, 3.0)


def test_default_baseline_priors_match_original_hardcoded_values():
    b = BaselinePriors()
    assert b.intercept_sigma == 0.25
    assert b.trend_sigma == 0.5
    assert b.season_sigma == 0.1
    assert b.control_sigma == 0.5
    assert b.noise_sigma == 0.1


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
    b = ChannelConfig("b", priors=ChannelPriors(beta_sigma=0.1))
    assert a.priors.beta_sigma == 0.5
    assert b.priors.beta_sigma == 0.1


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
