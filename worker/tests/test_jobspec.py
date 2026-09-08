"""The contract between the app and the worker.

Two properties matter more than the round-trip itself, and both are security properties
rather than correctness ones:

* a specification cannot name a storage path, so it cannot reach another project's data;
* a ROAS calibration — the strongest lever in the model — cannot be set without a
  recorded, user-confirmed experiment behind it.
"""

from __future__ import annotations

import copy

import pytest

from mmm_core.model import (
    ChannelConfig,
    ChannelIntent,
    ChannelType,
    ChannelUnit,
    Carryover,
    KpiType,
    MediaShare,
    ModelConfig,
    ModelIntent,
    SaturationBelief,
    SeasonalityBelief,
    Strength,
)
from mmm_worker.jobspec import (
    DEFAULT_SAMPLE,
    SpecError,
    parse_intent,
    parse_model_config,
    parse_prepare_recipe,
    sanitize_sample,
    serialize_intent,
    serialize_model_config,
    spec_hash,
)


def _config(**kw) -> ModelConfig:
    defaults = dict(
        kpi="revenue",
        channels=(
            ChannelConfig("tv", ChannelType.BRAND, unit=ChannelUnit.GRP),
            ChannelConfig("search", ChannelType.INTENT, unit=ChannelUnit.CURRENCY),
        ),
        control_columns=("price",),
        burn_in_weeks=6,
    )
    defaults.update(kw)
    return ModelConfig(**defaults)


# --- resolved specification round-trip -------------------------------------------------


def test_a_specification_survives_the_round_trip_exactly():
    config = _config()
    assert parse_model_config(serialize_model_config(config)) == config


def test_the_hash_is_stable_across_key_order():
    spec = serialize_model_config(_config())
    shuffled = {k: spec[k] for k in sorted(spec, reverse=True)}
    assert spec_hash(spec) == spec_hash(shuffled)


def test_the_hash_changes_when_the_specification_does():
    a = spec_hash(serialize_model_config(_config()))
    b = spec_hash(serialize_model_config(_config(burn_in_weeks=7)))
    assert a != b


def test_units_survive_serialisation():
    """A GRP channel silently becoming a euro channel would corrupt the budget advice."""
    config = parse_model_config(serialize_model_config(_config()))
    assert config.monetary_channel_names == ["search"]


# --- defence in depth on our own derivation --------------------------------------------


@pytest.mark.parametrize(
    "field, value",
    [("beta_sigma", 1e6), ("beta_sigma", 0.0), ("halfsat_log_sigma", 99.0)],
)
def test_an_implausible_prior_is_refused(field, value):
    """These should never fire — every prior is derived — so a hit means our own code is
    wrong, and failing loudly beats sampling nonsense for five minutes."""
    spec = serialize_model_config(_config())
    spec["channels"][0]["priors"][field] = value
    with pytest.raises(SpecError):
        parse_model_config(spec)


def test_an_unknown_prior_field_is_refused():
    spec = serialize_model_config(_config())
    spec["channels"][0]["priors"]["halfsat_a"] = 2.0  # a field from the old Beta prior
    with pytest.raises(SpecError, match="unknown channel prior"):
        parse_model_config(spec)


def test_an_unknown_enum_value_names_what_was_allowed():
    spec = serialize_model_config(_config())
    spec["channels"][0]["unit"] = "bitcoin"
    with pytest.raises(SpecError, match="'currency'"):
        parse_model_config(spec)


def test_a_specification_without_channels_is_refused():
    with pytest.raises(SpecError):
        parse_model_config({"kpi": "revenue", "channels": []})


# --- the calibration gate ----------------------------------------------------------------


def test_a_calibration_without_a_recorded_experiment_is_refused():
    """The strongest lever in the model may not come from a conversation.

    In v1 the architect tool could set `calibration: {roas, sd}` directly, and the worker
    cast it to float and applied it as a Potential that pulls the answer toward that number.
    """
    spec = serialize_model_config(_config())
    spec["channels"][1]["calibration"] = {"roas": 3.2, "sd": 0.4}
    with pytest.raises(SpecError, match="explicitly recorded and confirmed"):
        parse_model_config(spec)


def test_a_confirmed_experiment_is_accepted():
    spec = serialize_model_config(_config())
    spec["channels"][1]["calibration"] = {
        "roas": 3.2,
        "sd": 0.4,
        "experiment": {"kind": "geo_lift", "confirmed_by": "user-uuid", "period": "2024-Q2"},
    }
    config = parse_model_config(spec)
    assert config.channels[1].calibration.roas == 3.2


def test_a_calibration_on_a_non_currency_channel_is_refused():
    """"Return on ad spend" is not a thing you can have per GRP."""
    spec = serialize_model_config(_config())
    spec["channels"][0]["calibration"] = {
        "roas": 3.2, "sd": 0.4, "experiment": {"confirmed_by": "user"},
    }
    with pytest.raises(ValueError):
        parse_model_config(spec)


# --- intent ------------------------------------------------------------------------------


def test_intent_round_trips():
    intent = ModelIntent(
        kpi="revenue",
        kpi_type=KpiType.REVENUE,
        channels=(
            ChannelIntent(
                "tv", ChannelUnit.GRP, carryover=Carryover.LONG, strength=Strength.LARGE,
                saturation=SaturationBelief.FAR_FROM_SATURATED,
            ),
        ),
        control_columns=("price",),
        seasonality=SeasonalityBelief.STRONG,
        media_share_belief=MediaShare.LARGE,
    )
    assert parse_intent(serialize_intent(intent)) == intent


def test_intent_has_no_numeric_fields_to_get_wrong():
    """The point of the intent layer: an LLM can pick the wrong word, never a wrong number."""
    raw = serialize_intent(
        ModelIntent(
            kpi="revenue",
            kpi_type=KpiType.REVENUE,
            channels=(ChannelIntent("tv", ChannelUnit.CURRENCY),),
        )
    )
    for channel in raw["channels"]:
        assert all(isinstance(v, str) for v in channel.values())


def test_an_unknown_intent_word_is_refused_rather_than_defaulted():
    raw = serialize_intent(
        ModelIntent(
            kpi="revenue", kpi_type=KpiType.REVENUE,
            channels=(ChannelIntent("tv", ChannelUnit.CURRENCY),),
        )
    )
    raw["channels"][0]["carryover"] = "eeuwig"
    with pytest.raises(SpecError):
        parse_intent(raw)


# --- sampling parameters -----------------------------------------------------------------


def test_sampling_parameters_are_clamped_not_trusted():
    out = sanitize_sample({"draws": 999_999, "chains": 1, "target_accept": 0.5, "junk": 7})
    assert out["draws"] == 4000
    assert out["chains"] == 2          # below two, R-hat means nothing
    assert out["target_accept"] == 0.9
    assert "junk" not in out


def test_missing_sampling_parameters_fall_back_to_the_tested_defaults():
    assert sanitize_sample(None) == DEFAULT_SAMPLE
    assert sanitize_sample({})["draws"] == DEFAULT_SAMPLE["draws"]


# --- prepare recipes ----------------------------------------------------------------------


def test_a_recipe_resolves_paths_from_ids():
    recipe = {
        "sources": [
            {
                "source_file_id": "f1",
                "name": "kpi",
                "columns": [{"name": "revenue", "role": "kpi"}],
            }
        ]
    }
    spec = parse_prepare_recipe(recipe, {"f1": "proj-1/kpi.csv"})
    assert spec.sources[0].storage_path == "proj-1/kpi.csv"


def test_a_recipe_cannot_reference_a_file_from_another_project():
    recipe = {
        "sources": [
            {"source_file_id": "elsewhere", "name": "x", "columns": [{"name": "c", "role": "kpi"}]}
        ]
    }
    with pytest.raises(SpecError, match="does not belong to this project"):
        parse_prepare_recipe(recipe, {"f1": "proj-1/kpi.csv"})


def test_event_dummies_and_features_survive_the_recipe():
    recipe = {
        "sources": [
            {"source_file_id": "f1", "name": "kpi", "columns": [{"name": "revenue", "role": "kpi"}]}
        ],
        "event_dummies": [{"name": "black_friday", "weeks": [[2024, 48]]}],
        "features": [
            {"name": "lag1", "op": "lag", "inputs": ["revenue"], "params": {"weeks": 1, "unused": None}}
        ],
    }
    spec = parse_prepare_recipe(recipe, {"f1": "proj-1/kpi.csv"})
    assert spec.event_dummies[0].weeks == ((2024, 48),)
    # Nulls are dropped so mmm-core applies its own defaults rather than receiving None.
    assert spec.features[0].params == {"weeks": 1}
