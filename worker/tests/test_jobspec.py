import pytest

from mmm_core import Role
from mmm_core.model import (
    AdstockType,
    ChannelType,
    LikelihoodType,
    SaturationType,
    TrendType,
)
from mmm_worker.jobspec import parse_hier_job_config, parse_job_config


def _valid_config():
    return {
        "sources": [
            {"name": "revenue", "storage_path": "rev.csv", "date_column": "week",
             "columns": [{"name": "revenue", "role": "kpi"}]},
            {"name": "google", "storage_path": "g.csv", "date_column": "date",
             "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
        ],
        "model": {
            "kpi": "revenue",
            "channels": [{"name": "google_spend", "channel_type": "intent", "l_max": 8}],
            "seasonality_periods": 52, "n_fourier_modes": 2,
        },
        "sample": {"draws": 200, "tune": 200, "chains": 2, "unknown": 99},
    }


def test_parse_valid_config():
    spec = parse_job_config(_valid_config())
    assert [s.storage_path for s in spec.sources] == ["rev.csv", "g.csv"]
    assert spec.sources[1].spec.columns[0].role is Role.SPEND
    assert spec.sources[1].spec.columns[0].resolved_name() == "google_spend"
    assert spec.model.kpi == "revenue"
    assert spec.model.channels[0].channel_type is ChannelType.INTENT
    assert spec.model.channels[0].l_max == 8


def test_sample_kwargs_are_whitelisted_and_clamped():
    # Unknown keys dropped; draws/tune clamped to the safe minimum; chains pinned to 4.
    spec = parse_job_config(_valid_config())
    assert spec.sample == {"draws": 250, "tune": 250, "chains": 4}


def test_missing_model_raises():
    cfg = _valid_config()
    del cfg["model"]
    with pytest.raises(ValueError):
        parse_job_config(cfg)


def test_no_sources_raises():
    cfg = _valid_config()
    cfg["sources"] = []
    with pytest.raises(ValueError):
        parse_job_config(cfg)


def test_bad_role_raises():
    cfg = _valid_config()
    cfg["sources"][0]["columns"][0]["role"] = "not-a-role"
    with pytest.raises(ValueError):
        parse_job_config(cfg)


def test_event_dummies_are_parsed_and_appended_to_control_columns():
    cfg = _valid_config()
    cfg["event_dummies"] = [{"name": "dummy_2025w45", "weeks": [[2025, 45]]}]
    spec = parse_job_config(cfg)
    assert spec.event_dummies[0].name == "dummy_2025w45"
    assert spec.event_dummies[0].weeks == ((2025, 45),)
    assert "dummy_2025w45" in spec.model.control_columns


def test_event_dummy_already_listed_as_control_is_not_duplicated():
    cfg = _valid_config()
    cfg["model"]["control_columns"] = ["dummy_2025w45"]
    cfg["event_dummies"] = [{"name": "dummy_2025w45", "weeks": [[2025, 45]]}]
    spec = parse_job_config(cfg)
    assert spec.model.control_columns.count("dummy_2025w45") == 1


def test_no_event_dummies_defaults_to_empty():
    spec = parse_job_config(_valid_config())
    assert spec.event_dummies == ()


# --- toolbox fields --------------------------------------------------------------

def test_defaults_reproduce_original_model():
    spec = parse_job_config(_valid_config())
    ch = spec.model.channels[0]
    assert ch.adstock is AdstockType.GEOMETRIC
    assert ch.saturation is SaturationType.HILL
    assert spec.model.likelihood is LikelihoodType.NORMAL


def test_channel_adstock_saturation_and_priors_are_parsed():
    cfg = _valid_config()
    cfg["model"]["channels"][0].update(
        {"adstock": "delayed", "saturation": "logistic", "priors": {"beta_sigma": 0.3, "delayed_peak_weeks": 1.0}}
    )
    spec = parse_job_config(cfg)
    ch = spec.model.channels[0]
    assert ch.adstock is AdstockType.DELAYED
    assert ch.saturation is SaturationType.LOGISTIC
    assert ch.priors.beta_sigma == 0.3
    assert ch.priors.delayed_peak_weeks == 1.0
    # unspecified priors keep their defaults
    assert ch.priors.adstock_concentration == 20.0


def test_model_likelihood_and_baseline_priors_are_parsed():
    cfg = _valid_config()
    cfg["model"]["likelihood"] = "student_t"
    cfg["model"]["student_t_nu"] = 6.0
    cfg["model"]["priors"] = {"control_sigma": 0.3}
    spec = parse_job_config(cfg)
    assert spec.model.likelihood is LikelihoodType.STUDENT_T
    assert spec.model.student_t_nu == 6.0
    assert spec.model.priors.control_sigma == 0.3


def test_trend_type_and_changepoints_are_parsed():
    cfg = _valid_config()
    cfg["model"]["trend_type"] = "piecewise"
    cfg["model"]["n_changepoints"] = 10
    cfg["model"]["priors"] = {"changepoint_scale": 0.2}
    spec = parse_job_config(cfg)
    assert spec.model.trend_type is TrendType.PIECEWISE
    assert spec.model.n_changepoints == 10
    assert spec.model.priors.changepoint_scale == 0.2


def test_default_trend_type_is_linear():
    spec = parse_job_config(_valid_config())
    assert spec.model.trend_type is TrendType.LINEAR


def test_control_fill_is_parsed_on_source_column():
    cfg = _valid_config()
    cfg["sources"].append(
        {"name": "price", "storage_path": "p.csv", "date_column": "date", "essential": False,
         "columns": [{"name": "price", "role": "control", "fill": "interpolate"}]}
    )
    spec = parse_job_config(cfg)
    price_col = spec.sources[-1].spec.columns[0]
    assert price_col.fill == "interpolate"


def test_channel_calibration_is_parsed():
    cfg = _valid_config()
    cfg["model"]["channels"][0]["calibration"] = {"roas": 4.0, "sd": 0.8}
    spec = parse_job_config(cfg)
    cal = spec.model.channels[0].calibration
    assert cal is not None and cal.roas == 4.0 and cal.sd == 0.8


def test_no_calibration_defaults_to_none():
    spec = parse_job_config(_valid_config())
    assert spec.model.channels[0].calibration is None


def test_unknown_channel_prior_field_raises():
    cfg = _valid_config()
    cfg["model"]["channels"][0]["priors"] = {"not_a_prior": 1.0}
    with pytest.raises(ValueError):
        parse_job_config(cfg)


# --- strict-schema null tolerance -------------------------------------------------
# The architect's tool schema always sends every optional field, using an explicit
# ``null`` to mean "use the default". These must parse exactly like an absent key.

def test_explicit_null_optional_fields_fall_back_to_defaults():
    cfg = _valid_config()
    cfg["model"]["channels"][0].update(
        {"l_max": None, "expected_half_life": None, "priors": None, "calibration": None}
    )
    cfg["model"].update(
        {"n_changepoints": None, "student_t_nu": None, "n_fourier_modes": None, "priors": None}
    )
    spec = parse_job_config(cfg)
    ch = spec.model.channels[0]
    assert ch.l_max == 12
    assert ch.expected_half_life is None
    assert ch.calibration is None
    assert ch.priors.beta_sigma == 0.5  # default
    assert spec.model.n_changepoints == 6
    assert spec.model.student_t_nu == 4.0
    assert spec.model.n_fourier_modes == 2
    assert spec.model.priors.intercept_sigma == 0.25  # default


def test_null_prior_fields_are_ignored_and_set_ones_applied():
    cfg = _valid_config()
    # A strict-schema priors object sends every key; the untouched ones are null.
    cfg["model"]["channels"][0]["priors"] = {
        "beta_sigma": 0.3,
        "adstock_concentration": None,
        "delayed_peak_weeks": None,
        "delayed_peak_sigma": None,
        "hill_slope_a": None,
        "hill_slope_b": None,
        "halfsat_a": None,
        "halfsat_b": None,
        "logistic_lam_sigma": None,
    }
    spec = parse_job_config(cfg)
    ch = spec.model.channels[0]
    assert ch.priors.beta_sigma == 0.3  # applied
    assert ch.priors.adstock_concentration == 20.0  # null -> default


def test_null_seasonality_turns_it_off():
    cfg = _valid_config()
    cfg["model"]["seasonality_periods"] = None
    spec = parse_job_config(cfg)
    assert spec.model.seasonality_periods is None


# --- derived features -------------------------------------------------------------

def test_features_are_parsed_with_null_params_dropped():
    cfg = _valid_config()
    # The strict tool schema always sends every param key, using null for the unused ones.
    cfg["features"] = [
        {
            "name": "google_lag1",
            "op": "lag",
            "inputs": ["google_spend"],
            "params": {"weeks": 1, "window": None, "lower_q": None, "upper_q": None, "iso_weeks": None},
        }
    ]
    spec = parse_job_config(cfg)
    assert spec.features[0].name == "google_lag1"
    assert spec.features[0].op == "lag"
    assert spec.features[0].inputs == ("google_spend",)
    assert spec.features[0].params == {"weeks": 1}  # nulls dropped


def test_prepare_config_parses_features():
    from mmm_worker.jobspec import parse_prepare_config

    cfg = _valid_config()
    cfg["dataset_id"] = "ds1"
    cfg["features"] = [{"name": "tot", "op": "sum", "inputs": ["google_spend", "google_spend"], "params": {}}]
    spec = parse_prepare_config(cfg)
    assert spec.features[0].op == "sum"


def test_no_features_defaults_to_empty():
    spec = parse_job_config(_valid_config())
    assert spec.features == ()


def test_unknown_feature_op_raises():
    cfg = _valid_config()
    cfg["features"] = [{"name": "x", "op": "not_an_op", "inputs": ["google_spend"], "params": {}}]
    with pytest.raises(ValueError):
        parse_job_config(cfg)


# --- per-source transforms --------------------------------------------------------

def test_source_transforms_are_parsed_and_mapped():
    from mmm_worker.jobspec import source_transforms_map

    cfg = _valid_config()
    cfg["sources"][1]["transforms"] = [
        {"op": "scale", "params": {"column": "spend", "factor": 0.01, "offset": None}},
        {"op": "rename", "params": {"from": "spend", "to": "google_spend"}},
    ]
    spec = parse_job_config(cfg)
    google_ref = spec.sources[1]
    assert [t.op for t in google_ref.transforms] == ["scale", "rename"]
    assert google_ref.transforms[0].params == {"column": "spend", "factor": 0.01}  # null offset dropped
    mapping = source_transforms_map(spec.sources)
    assert "google" in mapping and len(mapping["google"]) == 2


def test_unknown_transform_op_raises():
    cfg = _valid_config()
    cfg["sources"][0]["transforms"] = [{"op": "not_a_transform", "params": {}}]
    with pytest.raises(ValueError):
        parse_job_config(cfg)


def test_no_transforms_defaults_to_empty():
    spec = parse_job_config(_valid_config())
    assert all(ref.transforms == () for ref in spec.sources)


def test_bad_adstock_type_raises():
    cfg = _valid_config()
    cfg["model"]["channels"][0]["adstock"] = "not-a-shape"
    with pytest.raises(ValueError):
        parse_job_config(cfg)


# --- hierarchical (multi-region) job configs --------------------------------------

def _hier_config():
    region_sources = [
        {"name": "revenue", "storage_path": "rev.csv", "date_column": "week",
         "columns": [{"name": "revenue", "role": "kpi"}]},
        {"name": "google", "storage_path": "g.csv", "date_column": "date",
         "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
    ]
    return {
        "regions": {
            "NL": {"sources": region_sources},
            "BE": {"sources": region_sources},
        },
        "model": {
            "kpi": "revenue",
            "channels": [{"name": "google_spend", "channel_type": "intent", "l_max": 8}],
        },
        "sample": {"draws": 200, "tune": 200, "chains": 2},
    }


def test_parse_hier_valid_config():
    spec = parse_hier_job_config(_hier_config())
    assert set(spec.regions) == {"NL", "BE"}
    assert spec.regions["NL"][0].storage_path == "rev.csv"
    assert spec.model.kpi == "revenue"
    assert spec.model.channels[0].l_max == 8
    assert spec.sample == {"draws": 250, "tune": 250, "chains": 4}


def test_hier_missing_regions_raises():
    cfg = _hier_config()
    del cfg["regions"]
    with pytest.raises(ValueError):
        parse_hier_job_config(cfg)


def test_hier_single_region_raises():
    cfg = _hier_config()
    del cfg["regions"]["BE"]
    with pytest.raises(ValueError):
        parse_hier_job_config(cfg)


def test_hier_event_dummies_and_control_columns_flow_through_shared_parser():
    cfg = _hier_config()
    cfg["event_dummies"] = [{"name": "dummy_2025w45", "weeks": [[2025, 45]]}]
    spec = parse_hier_job_config(cfg)
    assert "dummy_2025w45" in spec.model.control_columns
