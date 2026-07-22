"""Derived features: config-level columns computed from the aligned master table.

Event dummies (``events.py``) let a builder add a hand-named 0/1 column; this is the
more general step: *derive* a new explanatory column from columns that already exist in
the merged weekly master — a lag, a rolling average, a ratio/share, an interaction
(product), a transform (log, z-score, winsorize), or a recurring calendar dummy. This is
the "onderzoek naar variabelen die je kunt maken" step made concrete and safe: the
architect proposes a bounded, declarative recipe (op + inputs + params); the frozen,
tested core executes it deterministically. There is deliberately no free-form code
execution — every op here is a small numpy/pandas transform reusing the primitives in
:mod:`mmm_core.features`.

A derived column is added to the master with role CONTROL, exactly like an event dummy,
so it enters the model linearly without touching the model maths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

# Ops that take a single input column.
_UNARY_OPS = {"lag", "rolling_mean", "rolling_sum", "diff", "log1p", "zscore", "winsorize"}
# Ops that combine two or more input columns element-wise.
_NARY_OPS = {"ratio", "product", "sum"}
# Ops that need no input column (computed from the week index).
_INDEX_OPS = {"recurring_week_dummy"}
SUPPORTED_OPS = _UNARY_OPS | _NARY_OPS | _INDEX_OPS


@dataclass(frozen=True)
class FeatureSpec:
    """One derived column computed from the master table.

    Args:
        name: Output column name in the master dataset (added with role CONTROL).
        op: Which transform to apply (see :data:`SUPPORTED_OPS`).
        inputs: Existing master-column names this feature reads. Arity depends on ``op``:
            unary ops take exactly one, ``ratio`` exactly two, ``product``/``sum`` two or
            more, ``recurring_week_dummy`` none.
        params: Op-specific numeric parameters (e.g. ``{"weeks": 1}`` for ``lag``,
            ``{"window": 4}`` for a rolling mean, ``{"iso_weeks": [48]}`` for a recurring
            dummy). ``None`` values are treated as "use the default".
    """

    name: str
    op: str
    inputs: tuple[str, ...] = ()
    params: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("feature needs a name")
        if self.op not in SUPPORTED_OPS:
            raise ValueError(f"unknown feature op {self.op!r}; use one of {sorted(SUPPORTED_OPS)}")
        if self.op in _UNARY_OPS and len(self.inputs) != 1:
            raise ValueError(f"feature {self.name!r}: op {self.op!r} needs exactly one input")
        if self.op == "ratio" and len(self.inputs) != 2:
            raise ValueError(f"feature {self.name!r}: 'ratio' needs exactly two inputs (numerator, denominator)")
        if self.op in {"product", "sum"} and len(self.inputs) < 2:
            raise ValueError(f"feature {self.name!r}: {self.op!r} needs at least two inputs")
        if self.op in _INDEX_OPS and self.inputs:
            raise ValueError(f"feature {self.name!r}: op {self.op!r} takes no input columns")


def _param(spec: FeatureSpec, key: str, default: Any = None) -> Any:
    value = spec.params.get(key, default)
    return default if value is None else value


def _clean(series: pd.Series, name: str) -> pd.Series:
    """Every derived control must be finite and gap-free before it enters the model."""
    return series.replace([np.inf, -np.inf], np.nan).fillna(0.0).rename(name)


def build_feature(spec: FeatureSpec, data: pd.DataFrame) -> pd.Series:
    """Compute ``spec`` against ``data`` (the aligned master), returning a finite Series.

    Raises ``ValueError`` if an input column is missing or a required parameter is absent;
    the pipeline turns that into a quality-report error and skips the feature.
    """
    missing = [c for c in spec.inputs if c not in data.columns]
    if missing:
        raise ValueError(f"feature {spec.name!r}: unknown input column(s) {missing}")

    from mmm_core.features import (
        lagged_feature,
        log1p_feature,
        recurring_week_dummy,
        rolling_mean,
        winsorize,
        zscore,
    )

    op = spec.op
    if op == "lag":
        weeks = _param(spec, "weeks")
        if weeks is None:
            raise ValueError(f"feature {spec.name!r}: 'lag' needs a 'weeks' parameter (>= 1)")
        result = lagged_feature(data[spec.inputs[0]], int(weeks))
    elif op == "rolling_mean":
        window = _param(spec, "window")
        if window is None:
            raise ValueError(f"feature {spec.name!r}: 'rolling_mean' needs a 'window' parameter (>= 1)")
        result = rolling_mean(data[spec.inputs[0]], int(window))
    elif op == "rolling_sum":
        window = _param(spec, "window")
        if window is None:
            raise ValueError(f"feature {spec.name!r}: 'rolling_sum' needs a 'window' parameter (>= 1)")
        if int(window) < 1:
            raise ValueError("window must be >= 1")
        result = data[spec.inputs[0]].rolling(int(window), min_periods=1).sum()
    elif op == "diff":
        weeks = int(_param(spec, "weeks", 1))
        if weeks < 1:
            raise ValueError("diff 'weeks' must be >= 1")
        result = data[spec.inputs[0]].diff(weeks)
    elif op == "log1p":
        # Sign-preserving so a stray negative never raises inside the pipeline.
        series = data[spec.inputs[0]]
        if (series.dropna() < 0).any():
            result = np.sign(series) * np.log1p(series.abs())
        else:
            result = log1p_feature(series)
    elif op == "zscore":
        result = zscore(data[spec.inputs[0]])
    elif op == "winsorize":
        lower_q = float(_param(spec, "lower_q", 0.01))
        upper_q = float(_param(spec, "upper_q", 0.99))
        result = winsorize(data[spec.inputs[0]], lower_q, upper_q)
    elif op == "ratio":
        num, den = data[spec.inputs[0]], data[spec.inputs[1]]
        result = num.divide(den.where(den != 0, np.nan))
    elif op == "product":
        result = data[list(spec.inputs)].prod(axis=1)
    elif op == "sum":
        result = data[list(spec.inputs)].sum(axis=1)
    elif op == "recurring_week_dummy":
        iso_weeks = _param(spec, "iso_weeks")
        if not iso_weeks:
            raise ValueError(f"feature {spec.name!r}: 'recurring_week_dummy' needs an 'iso_weeks' list")
        result = recurring_week_dummy(data.index, [int(w) for w in iso_weeks], name=spec.name)
    else:  # pragma: no cover - guarded by __post_init__
        raise ValueError(f"unknown feature op {op!r}")

    return _clean(pd.Series(result, index=data.index), spec.name)
