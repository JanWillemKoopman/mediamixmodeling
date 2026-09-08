"""The contract between the app and the worker: serialise and parse model specifications.

Two things changed fundamentally from v1, and both close a hole rather than adding a
feature.

**Storage paths no longer travel in the config.** In v1 the job config carried
``sources[].storage_path`` straight from the client (and, on the auto-refine path, straight
from a language model), and the worker downloaded those paths with the service-role key,
which bypasses row-level security. Nothing checked that the path belonged to the project.
Now a run references a ``dataset_version_id``; the worker looks the path up itself. There
is no field left to point somewhere else.

**Priors are not part of the wire format the AI can reach.** The app sends *intent* —
ordinal words, no numbers (see :mod:`mmm_core.model.intent`) — and the resolved
specification is derived server-side by :func:`mmm_core.model.priors.build_model_config`
from that intent plus measured statistics of the actual dataset. What this module parses is
the *already resolved* spec, produced by trusted code. The bounds below are therefore a
defence-in-depth check on our own serialisation, not a filter on user input.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, fields, is_dataclass
from enum import Enum

from mmm_core import ColumnSpec, EventDummySpec, FeatureSpec, Role, SourceSpec, TransformSpec
from mmm_core.model import (
    AdstockType,
    BaselinePriors,
    Carryover,
    ChannelConfig,
    ChannelIntent,
    ChannelPriors,
    ChannelRole,
    ChannelType,
    ChannelUnit,
    KpiType,
    LikelihoodType,
    MediaShare,
    ModelConfig,
    ModelIntent,
    RoasCalibration,
    SaturationBelief,
    SaturationType,
    SeasonalityBelief,
    SeasonalityBelief as _SeasonalityBelief,
    Strength,
    TrendType,
)

# Sampling parameters are chosen by the product, not by the user or the AI: below these
# minimums the diagnostics stop meaning anything (R-hat needs >= 2 chains; a credible
# interval needs real draws), and above the maximums a run blows its time budget.
_SAMPLE_BOUNDS = {
    "draws": (250, 4000),
    "tune": (250, 4000),
    "chains": (2, 4),
    "target_accept": (0.9, 0.995),
}
_ALLOWED_SAMPLE_KEYS = set(_SAMPLE_BOUNDS) | {"seed"}

DEFAULT_SAMPLE = {"draws": 1000, "tune": 1000, "chains": 4, "target_accept": 0.95, "seed": 0}

# Sanity bounds on the *resolved* priors. These should never fire — the prior builder
# derives every one of them from the data — so a violation means our own serialisation or
# derivation is wrong, and failing loudly beats sampling a nonsense model for five minutes.
_PRIOR_BOUNDS = {
    "beta_sigma": (1e-9, 50.0),
    "adstock_concentration": (0.5, 500.0),
    "delayed_peak_weeks": (0.0, 52.0),
    "delayed_peak_sigma": (1e-6, 20.0),
    "hill_slope_a": (0.1, 50.0),
    "hill_slope_b": (0.1, 50.0),
    "halfsat_log_center": (1e-9, 1000.0),
    "halfsat_log_sigma": (1e-3, 5.0),
    "logistic_lam_sigma": (1e-6, 1000.0),
    "intercept_mu": (-100.0, 100.0),
    "intercept_sigma": (1e-6, 50.0),
    "trend_sigma": (1e-6, 50.0),
    "season_sigma": (0.0, 50.0),
    "control_sigma": (1e-6, 50.0),
    "noise_sigma": (1e-9, 50.0),
    "changepoint_scale": (1e-9, 50.0),
}


class SpecError(ValueError):
    """A specification that cannot be run. Always a permanent failure, never retried."""


def _require(d: dict, key: str, ctx: str):
    if key not in d or d[key] is None:
        raise SpecError(f"{ctx}: missing {key!r}")
    return d[key]


def _bounded(name: str, value) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError) as exc:
        raise SpecError(f"prior {name!r} is not a number: {value!r}") from exc
    lo, hi = _PRIOR_BOUNDS[name]
    if not (lo <= num <= hi):
        raise SpecError(
            f"prior {name!r} = {num} is outside the plausible range [{lo}, {hi}]; this "
            f"indicates a bug in prior derivation, not a user error"
        )
    return num


def _enum(cls, value, ctx: str):
    try:
        return cls(value)
    except ValueError as exc:
        allowed = ", ".join(repr(m.value) for m in cls)
        raise SpecError(f"{ctx}: {value!r} is not one of {allowed}") from exc


# --- sampling ---------------------------------------------------------------------

def sanitize_sample(sample: dict | None) -> dict:
    """Clamp sampling parameters into safe bounds; drop unknown keys and junk."""
    out = dict(DEFAULT_SAMPLE)
    for key, value in (sample or {}).items():
        if key not in _ALLOWED_SAMPLE_KEYS or value is None:
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            continue
        if key in _SAMPLE_BOUNDS:
            lo, hi = _SAMPLE_BOUNDS[key]
            num = min(max(num, lo), hi)
        out[key] = num if key == "target_accept" else int(num)
    return out


# --- resolved model specification -------------------------------------------------

def _plain(obj):
    if isinstance(obj, Enum):
        return obj.value
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _plain(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_plain(v) for v in obj]
    return obj


def serialize_model_config(config: ModelConfig) -> dict:
    """The resolved specification as plain JSON, ready to store on a configuration row."""
    return _plain(config)


def spec_hash(spec: dict) -> str:
    """Stable hash of a resolved specification, for the run's idempotency key.

    Sorted keys and no whitespace, so the same specification always hashes the same way
    regardless of how the dict happened to be built.
    """
    return hashlib.sha256(
        json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _channel_priors(d: dict | None) -> ChannelPriors:
    if not d:
        return ChannelPriors()
    known = {f.name for f in fields(ChannelPriors)}
    unknown = set(d) - known
    if unknown:
        raise SpecError(f"unknown channel prior field(s) {sorted(unknown)}")
    return ChannelPriors(
        **{k: _bounded(k, v) for k, v in d.items() if v is not None}
    )


def _baseline_priors(d: dict | None) -> BaselinePriors:
    if not d:
        return BaselinePriors()
    known = {f.name for f in fields(BaselinePriors)}
    unknown = set(d) - known
    if unknown:
        raise SpecError(f"unknown model prior field(s) {sorted(unknown)}")
    return BaselinePriors(
        **{k: _bounded(k, v) for k, v in d.items() if v is not None}
    )


def _calibration(d: dict | None) -> RoasCalibration | None:
    """Parse a measured-experiment calibration.

    This is the strongest lever in the model — a Potential that pulls a channel's implied
    ROAS toward a number — so it may only come from an experiment the user recorded and
    confirmed. The ``experiment`` block is what proves that happened; a calibration without
    it is refused rather than quietly applied.
    """
    if not d:
        return None
    experiment = d.get("experiment")
    if not isinstance(experiment, dict) or not experiment.get("confirmed_by"):
        raise SpecError(
            "a ROAS calibration may only come from an experiment the user explicitly "
            "recorded and confirmed; it is never inferred from a conversation"
        )
    return RoasCalibration(
        roas=float(_require(d, "roas", "calibration")),
        sd=float(_require(d, "sd", "calibration")),
    )


def _channel(c: dict) -> ChannelConfig:
    name = _require(c, "name", "channel")
    return ChannelConfig(
        name=name,
        channel_type=_enum(ChannelType, c.get("channel_type", "generic"), f"channel {name}"),
        unit=_enum(ChannelUnit, _require(c, "unit", f"channel {name}"), f"channel {name}"),
        l_max=int(c.get("l_max") or 12),
        expected_half_life=(
            float(c["expected_half_life"]) if c.get("expected_half_life") is not None else None
        ),
        adstock=_enum(AdstockType, c.get("adstock", "geometric"), f"channel {name}"),
        saturation=_enum(SaturationType, c.get("saturation", "hill"), f"channel {name}"),
        priors=_channel_priors(c.get("priors")),
        calibration=_calibration(c.get("calibration")),
    )


def parse_model_config(spec: dict) -> ModelConfig:
    """Parse a stored ``resolved_spec`` back into a :class:`ModelConfig`.

    Round-trips :func:`serialize_model_config`. Every enum and every prior is validated on
    the way in, so a corrupted or hand-edited row fails immediately with a clear message
    instead of sampling something meaningless.
    """
    if not isinstance(spec, dict):
        raise SpecError("resolved specification must be an object")
    channels = _require(spec, "channels", "spec")
    if not channels:
        raise SpecError("spec: at least one channel is required")
    return ModelConfig(
        kpi=_require(spec, "kpi", "spec"),
        kpi_type=_enum(KpiType, spec.get("kpi_type", "revenue"), "spec"),
        channels=tuple(_channel(c) for c in channels),
        control_columns=tuple(spec.get("control_columns") or ()),
        add_trend=bool(spec.get("add_trend", True)),
        trend_type=_enum(TrendType, spec.get("trend_type", "linear"), "spec"),
        n_changepoints=int(spec.get("n_changepoints") or 6),
        seasonality_periods=(
            None if spec.get("seasonality_periods") is None
            else float(spec["seasonality_periods"])
        ),
        n_fourier_modes=int(spec.get("n_fourier_modes") or 2),
        likelihood=_enum(LikelihoodType, spec.get("likelihood", "normal"), "spec"),
        student_t_nu=float(spec.get("student_t_nu") or 4.0),
        burn_in_weeks=int(spec.get("burn_in_weeks") or 0),
        priors=_baseline_priors(spec.get("priors")),
    )


# --- intent (what the AI or the user actually said) --------------------------------

def serialize_intent(intent: ModelIntent) -> dict:
    return _plain(intent)


def parse_intent(raw: dict) -> ModelIntent:
    """Parse a stated intent. Every field is a closed enum — there are no numbers to get
    wrong, which is the entire point of the intent layer."""
    if not isinstance(raw, dict):
        raise SpecError("intent must be an object")
    channels = _require(raw, "channels", "intent")
    if not channels:
        raise SpecError("intent: at least one channel is required")
    parsed = []
    for c in channels:
        name = _require(c, "name", "channel intent")
        parsed.append(
            ChannelIntent(
                name=name,
                unit=_enum(ChannelUnit, _require(c, "unit", f"channel {name}"), f"channel {name}"),
                role=_enum(ChannelRole, c.get("role", "mixed"), f"channel {name}"),
                carryover=_enum(Carryover, c.get("carryover", "unknown"), f"channel {name}"),
                strength=_enum(Strength, c.get("strength", "unknown"), f"channel {name}"),
                saturation=_enum(
                    SaturationBelief, c.get("saturation", "unknown"), f"channel {name}"
                ),
            )
        )
    media_share = raw.get("media_share_belief")
    return ModelIntent(
        kpi=_require(raw, "kpi", "intent"),
        kpi_type=_enum(KpiType, _require(raw, "kpi_type", "intent"), "intent"),
        channels=tuple(parsed),
        control_columns=tuple(raw.get("control_columns") or ()),
        seasonality=_enum(
            _SeasonalityBelief, raw.get("seasonality", "unknown"), "intent"
        ),
        expect_trend=bool(raw.get("expect_trend", True)),
        expect_structural_break=bool(raw.get("expect_structural_break", False)),
        media_share_belief=(
            _enum(MediaShare, media_share, "intent") if media_share is not None else None
        ),
        notes=tuple(raw.get("notes") or ()),
    )


# --- dataset build recipe -----------------------------------------------------------

@dataclass(frozen=True)
class SourceRef:
    """One uploaded file to read, with the path resolved server-side from its row id."""

    spec: SourceSpec
    storage_path: str
    transforms: tuple[TransformSpec, ...] = ()


@dataclass(frozen=True)
class PrepareSpec:
    """The recipe for building one dataset version."""

    sources: list[SourceRef]
    event_dummies: tuple[EventDummySpec, ...] = ()
    features: tuple[FeatureSpec, ...] = ()


def _transforms(source: dict) -> tuple[TransformSpec, ...]:
    return tuple(
        TransformSpec(
            op=_require(t, "op", "transform"),
            params={k: v for k, v in (t.get("params") or {}).items() if v is not None},
        )
        for t in (source.get("transforms") or ())
    )


def _event_dummies(config: dict) -> tuple[EventDummySpec, ...]:
    return tuple(
        EventDummySpec(
            name=_require(d, "name", "event dummy"),
            weeks=tuple((int(p[0]), int(p[1])) for p in _require(d, "weeks", "event dummy")),
        )
        for d in (config.get("event_dummies") or ())
    )


def _features(config: dict) -> tuple[FeatureSpec, ...]:
    return tuple(
        FeatureSpec(
            name=_require(f, "name", "feature"),
            op=_require(f, "op", "feature"),
            inputs=tuple(f.get("inputs") or ()),
            params={k: v for k, v in (f.get("params") or {}).items() if v is not None},
        )
        for f in (config.get("features") or ())
    )


def parse_prepare_recipe(recipe: dict, storage_paths: dict[str, str]) -> PrepareSpec:
    """Parse a dataset recipe, resolving each source's storage path from its row id.

    ``storage_paths`` maps ``source_file_id -> storage_path`` and is looked up by the
    caller from the ``source_files`` rows of *this project*. The recipe itself carries only
    ids, so a recipe cannot name a file in another project — the v1 hole where a
    client-supplied path was downloaded with the service-role key is closed by
    construction rather than by a check that could be forgotten.
    """
    raw_sources = _require(recipe, "sources", "recipe")
    if not raw_sources:
        raise SpecError("recipe: at least one source is required")
    sources: list[SourceRef] = []
    for s in raw_sources:
        source_file_id = _require(s, "source_file_id", "source")
        if source_file_id not in storage_paths:
            raise SpecError(
                f"source file {source_file_id!r} does not belong to this project"
            )
        cols = tuple(
            ColumnSpec(
                name=_require(c, "name", "source column"),
                role=_enum(Role, _require(c, "role", "source column"), "source column"),
                output_name=c.get("output_name"),
                fill=c.get("fill"),
            )
            for c in _require(s, "columns", "source")
        )
        sources.append(
            SourceRef(
                spec=SourceSpec(
                    name=_require(s, "name", "source"),
                    columns=cols,
                    date_column=s.get("date_column"),
                    essential=bool(s.get("essential", True)),
                ),
                storage_path=storage_paths[source_file_id],
                transforms=_transforms(s),
            )
        )
    return PrepareSpec(
        sources=sources,
        event_dummies=_event_dummies(recipe),
        features=_features(recipe),
    )


def source_transforms_map(sources: list[SourceRef]) -> dict[str, list[TransformSpec]]:
    """Per-source transform lists keyed by source name, for ``build_master_dataset``."""
    return {ref.spec.name: list(ref.transforms) for ref in sources if ref.transforms}
