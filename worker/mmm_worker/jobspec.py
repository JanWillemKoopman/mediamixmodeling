"""Parse a job's ``config`` JSON into mmm-core objects.

This is the contract between the wizard (which writes the job) and the worker (which
runs it). Keeping it in one place means the frontend and worker agree on exactly one
shape. Minimal example (everything but ``sources`` + ``model`` is optional):

    {
      "sources": [
        {"name": "revenue", "storage_path": "proj/rev.csv", "date_column": "week",
         "columns": [{"name": "revenue", "role": "kpi"}]},
        {"name": "google", "storage_path": "proj/google.csv", "date_column": "date",
         "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]}
      ],
      "model": {
        "kpi": "revenue",
        "channels": [{"name": "google_spend", "channel_type": "intent"}],
        "control_columns": [], "add_trend": true,
        "seasonality_periods": 52, "n_fourier_modes": 2
      },
      "event_dummies": [{"name": "dummy_2025w45", "weeks": [[2025, 45]]}],
      "sample": {"draws": 1000, "tune": 1000, "chains": 4}
    }

The full toolbox is opt-in per field (defaults reproduce the original model):

    * per channel: ``adstock`` ("geometric"|"delayed"), ``saturation`` ("hill"|"logistic"),
      ``l_max``, ``expected_half_life``, and a ``priors`` object (any subset of the
      ChannelPriors fields).
    * per model: ``likelihood`` ("normal"|"student_t"), ``student_t_nu``, and a ``priors``
      object (any subset of the BaselinePriors fields).
    * per control column: ``fill`` ("zero"|"ffill"|"bfill"|"interpolate"|"mean"|"median").
    * ``event_dummies``: 0/1 control columns for named ISO weeks; their names are appended
      to ``model.control_columns`` automatically.
    * ``evaluation``: optional ``{"cross_validation": bool, "placebo": bool}``, both
      default ``false``. Opt-in extra reliability checks run once after the main fit
      succeeds and folded into the quality gate (see :class:`EvaluationSpec`); each
      roughly doubles the job's compute cost, so leave both off unless asked for.

A separate job type, ``fit_hierarchical``, fits a multi-region model instead
(:func:`parse_hier_job_config`): its config replaces top-level ``sources`` with
``regions`` — ``{"<region name>": {"sources": [...]}}``, one entry per region, each using
the same column-role recipe as a single-region job — and is otherwise shaped like a normal
fit job (``model``, ``event_dummies``, ``features``, ``sample``). See
:func:`mmm_core.ingestion.build_master_datasets_by_region` and
:func:`mmm_core.model.hierarchical.fit_hierarchical`.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields

from mmm_core import ColumnSpec, EventDummySpec, FeatureSpec, Role, SourceSpec, TransformSpec
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
    TrendType,
)

_ALLOWED_SAMPLE_KEYS = {"draws", "tune", "chains", "target_accept", "seed"}

# Hard bounds on user-supplied sampling parameters. Below the minimums the diagnostics
# (R-hat needs >= 2 chains; ESS needs real draws) become meaningless; above the maximums
# a job risks blowing the worker's time/memory budget. Chains is pinned to 4: fewer makes
# R-hat unreliable, more buys nothing on a 4-CPU container.
_SAMPLE_BOUNDS = {
    "draws": (250, 4000),
    "tune": (250, 4000),
    "chains": (4, 4),
    "target_accept": (0.9, 0.995),
}


def _sanitize_sample(sample: dict) -> dict:
    """Clamp sampling params into safe bounds; drop unknown keys and non-numeric junk."""
    out: dict = {}
    for key, value in sample.items():
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
_CHANNEL_PRIOR_FIELDS = {f.name for f in fields(ChannelPriors)}
_BASELINE_PRIOR_FIELDS = {f.name for f in fields(BaselinePriors)}


@dataclass(frozen=True)
class SourceRef:
    spec: SourceSpec
    storage_path: str
    transforms: tuple[TransformSpec, ...] = ()


@dataclass(frozen=True)
class EvaluationSpec:
    """Opt-in extra reliability checks run once, after the main fit succeeds.

    Both default off: each roughly doubles (or worse) the job's compute time — a
    cross-validation fold or the placebo test is itself a full extra fit — so they must
    never run unless the builder explicitly asks for them. See
    :func:`mmm_core.model.fit.recompute_quality_gate`.
    """

    cross_validation: bool = False
    placebo: bool = False


@dataclass(frozen=True)
class JobSpec:
    sources: list[SourceRef]
    model: ModelConfig
    sample: dict
    event_dummies: tuple[EventDummySpec, ...] = ()
    features: tuple[FeatureSpec, ...] = ()
    evaluation: EvaluationSpec = field(default_factory=EvaluationSpec)


@dataclass(frozen=True)
class HierJobSpec:
    """The parsed config of a ``type='fit_hierarchical'`` job — see
    :func:`parse_hier_job_config`."""

    regions: dict[str, list[SourceRef]]
    model: ModelConfig
    sample: dict
    event_dummies: tuple[EventDummySpec, ...] = ()
    features: tuple[FeatureSpec, ...] = ()


@dataclass(frozen=True)
class PrepareSpec:
    """The recipe for a data-prep run: merge these sources (with this mapping) and check
    them, but do not fit. This is the ``config`` of a ``type='prepare'`` job."""

    sources: list[SourceRef]
    event_dummies: tuple[EventDummySpec, ...] = ()
    features: tuple[FeatureSpec, ...] = ()


def _require(d: dict, key: str, ctx: str):
    if key not in d:
        raise ValueError(f"job config: missing {key!r} in {ctx}")
    return d[key]


# The architect's tool schema is strict: optional numeric fields are declared nullable and
# always present, so the model emits an explicit ``null`` to mean "use the default" rather
# than omitting the key. Treat ``None`` exactly like an absent key here.
def _opt_int(value, default: int) -> int:
    return default if value is None else int(value)


def _opt_float(value, default: float) -> float:
    return default if value is None else float(value)


def _parse_event_dummies(config: dict) -> tuple[EventDummySpec, ...]:
    specs = []
    for d in config.get("event_dummies", ()):
        weeks = tuple(
            (int(pair[0]), int(pair[1])) for pair in _require(d, "weeks", "event dummy")
        )
        specs.append(EventDummySpec(name=_require(d, "name", "event dummy"), weeks=weeks))
    return tuple(specs)


def _parse_features(config: dict) -> tuple[FeatureSpec, ...]:
    """Parse declarative derived-feature specs (lag/rolling/ratio/interaction/...).

    The architect's strict tool schema always sends a fixed ``params`` object with a null
    for every parameter it isn't using; null params are dropped here so mmm-core applies
    the op's own defaults. Op/arity validation lives in :class:`FeatureSpec`.
    """
    specs = []
    for f in config.get("features", ()) or ():
        raw_params = f.get("params") or {}
        params = {k: v for k, v in raw_params.items() if v is not None}
        specs.append(
            FeatureSpec(
                name=_require(f, "name", "feature"),
                op=_require(f, "op", "feature"),
                inputs=tuple(f.get("inputs") or ()),
                params=params,
            )
        )
    return tuple(specs)


def _channel_priors(d: dict | None) -> ChannelPriors:
    if not d:
        return ChannelPriors()
    unknown = set(d) - _CHANNEL_PRIOR_FIELDS
    if unknown:
        raise ValueError(f"job config: unknown channel prior field(s) {sorted(unknown)}")
    # null == "keep the default" (the strict schema always sends every prior key).
    return ChannelPriors(**{k: float(v) for k, v in d.items() if v is not None})


def _baseline_priors(d: dict | None) -> BaselinePriors:
    if not d:
        return BaselinePriors()
    unknown = set(d) - _BASELINE_PRIOR_FIELDS
    if unknown:
        raise ValueError(f"job config: unknown model prior field(s) {sorted(unknown)}")
    return BaselinePriors(**{k: float(v) for k, v in d.items() if v is not None})


def _parse_calibration(d: dict | None) -> RoasCalibration | None:
    if not d:
        return None
    return RoasCalibration(roas=float(_require(d, "roas", "calibration")), sd=float(_require(d, "sd", "calibration")))


def _parse_channel(c: dict) -> ChannelConfig:
    return ChannelConfig(
        name=_require(c, "name", "channel"),
        channel_type=ChannelType(c.get("channel_type") or "generic"),
        l_max=_opt_int(c.get("l_max"), 12),
        expected_half_life=c.get("expected_half_life"),
        adstock=AdstockType(c.get("adstock", "geometric")),
        saturation=SaturationType(c.get("saturation", "hill")),
        priors=_channel_priors(c.get("priors")),
        calibration=_parse_calibration(c.get("calibration")),
    )


def _parse_transforms(source: dict) -> tuple[TransformSpec, ...]:
    """Parse a source's optional raw-table cleaning/reshaping transforms.

    Op/arity is validated by :class:`TransformSpec`; params stay a free-form dict that
    mmm-core validates per op at build time (null params are dropped so op defaults apply).
    """
    specs = []
    for t in source.get("transforms", ()) or ():
        raw_params = t.get("params") or {}
        params = {k: v for k, v in raw_params.items() if v is not None}
        specs.append(TransformSpec(op=_require(t, "op", "transform"), params=params))
    return tuple(specs)


def _parse_sources(config: dict) -> list[SourceRef]:
    raw_sources = _require(config, "sources", "config")
    if not raw_sources:
        raise ValueError("config: at least one source is required")
    sources: list[SourceRef] = []
    for s in raw_sources:
        cols = tuple(
            ColumnSpec(
                name=_require(c, "name", "source column"),
                role=Role(_require(c, "role", "source column")),
                output_name=c.get("output_name"),
                fill=c.get("fill"),
            )
            for c in _require(s, "columns", "source")
        )
        spec = SourceSpec(
            name=_require(s, "name", "source"),
            columns=cols,
            date_column=s.get("date_column"),
            essential=s.get("essential", True),
        )
        sources.append(
            SourceRef(
                spec=spec,
                storage_path=_require(s, "storage_path", "source"),
                transforms=_parse_transforms(s),
            )
        )
    return sources


def source_transforms_map(sources: list[SourceRef]) -> dict[str, list[TransformSpec]]:
    """The per-source transform lists keyed by source name, for build_master_dataset."""
    return {ref.spec.name: list(ref.transforms) for ref in sources if ref.transforms}


def _parse_evaluation(config: dict) -> EvaluationSpec:
    d = config.get("evaluation") or {}
    unknown = set(d) - {"cross_validation", "placebo"}
    if unknown:
        raise ValueError(f"job config: unknown evaluation field(s) {sorted(unknown)}")
    return EvaluationSpec(
        cross_validation=bool(d.get("cross_validation", False)),
        placebo=bool(d.get("placebo", False)),
    )


def parse_prepare_config(config: dict) -> PrepareSpec:
    """Parse a ``type='prepare'`` job's ``config`` (sources + event dummies + features)."""
    return PrepareSpec(
        sources=_parse_sources(config),
        event_dummies=_parse_event_dummies(config),
        features=_parse_features(config),
    )


def _parse_model(config: dict, event_dummies: tuple[EventDummySpec, ...]) -> ModelConfig:
    """Parse the ``model`` block shared by single-region and hierarchical job configs."""
    m = _require(config, "model", "config")
    channels = tuple(_parse_channel(c) for c in _require(m, "channels", "model"))

    # Declared event dummies become control columns automatically -- the builder
    # names them once (in "event_dummies") rather than also listing them here.
    control_columns = list(m.get("control_columns", ()))
    for spec_dummy in event_dummies:
        if spec_dummy.name not in control_columns:
            control_columns.append(spec_dummy.name)

    return ModelConfig(
        kpi=_require(m, "kpi", "model"),
        channels=channels,
        control_columns=tuple(control_columns),
        add_trend=bool(m.get("add_trend", True)),
        trend_type=TrendType(m.get("trend_type") or "linear"),
        n_changepoints=_opt_int(m.get("n_changepoints"), 6),
        seasonality_periods=m.get("seasonality_periods", 52.0),
        n_fourier_modes=_opt_int(m.get("n_fourier_modes"), 2),
        likelihood=LikelihoodType(m.get("likelihood") or "normal"),
        student_t_nu=_opt_float(m.get("student_t_nu"), 4.0),
        priors=_baseline_priors(m.get("priors")),
    )


def parse_job_config(config: dict) -> JobSpec:
    """Validate and parse a job ``config`` dict into a :class:`JobSpec`."""
    sources = _parse_sources(config)
    event_dummies = _parse_event_dummies(config)
    model = _parse_model(config, event_dummies)
    sample = _sanitize_sample(config.get("sample", {}))
    return JobSpec(
        sources=sources,
        model=model,
        sample=sample,
        event_dummies=event_dummies,
        features=_parse_features(config),
        evaluation=_parse_evaluation(config),
    )


def parse_hier_job_config(config: dict) -> HierJobSpec:
    """Parse a hierarchical/multi-region fit job's config (job ``type='fit_hierarchical'``).

    Same shape as :func:`parse_job_config`, except ``sources`` is nested one level under
    ``regions``::

        {"regions": {"NL": {"sources": [...]}, "BE": {"sources": [...]}},
         "model": {...same shape as a single-region job...}, "sample": {...}}

    Each region's ``sources`` are parsed exactly like a single-region job's — the same
    recipe (KPI/channel/control column names) is expected to apply to every region's own
    files, since :func:`mmm_core.model.hierarchical.build_hierarchical_model` requires
    every region to expose the same columns. See
    :func:`mmm_core.ingestion.build_master_datasets_by_region` for how the regions are
    merged and aligned to a shared weekly window before fitting.
    """
    raw_regions = _require(config, "regions", "config")
    if not raw_regions or len(raw_regions) < 2:
        raise ValueError("config: a hierarchical job needs at least two regions")
    regions = {region: _parse_sources(region_config) for region, region_config in raw_regions.items()}

    event_dummies = _parse_event_dummies(config)
    model = _parse_model(config, event_dummies)
    sample = _sanitize_sample(config.get("sample", {}))
    return HierJobSpec(
        regions=regions,
        model=model,
        sample=sample,
        event_dummies=event_dummies,
        features=_parse_features(config),
    )
