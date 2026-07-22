"""Per-source table transforms applied to a raw uploaded file *before* role-mapping.

Where :mod:`feature_engineering` derives new columns on the aligned weekly master, this
module cleans and reshapes each *raw* source first — the messy real-world step that turns
"diverse bestanden in verschillende vormen" into something the role-mapping + weekly
aggregation can consume. It is the safe, inspectable answer to "give Claude full room to
edit the data": the architect proposes an ordered list of typed operations, and the
frozen, tested core executes them deterministically. There is deliberately no free-form
code execution — every op is a small, auditable pandas transform.

Supported ops (each takes op-specific ``params``):
    rename            {"from": str, "to": str}                    rename one column
    drop_columns      {"columns": [str, ...]}                     remove columns
    filter_rows       {"column": str, "compare": op, "value"/"values"}   keep matching rows
    drop_duplicates   {"subset": [str, ...] | null}               drop duplicate rows
    scale             {"column": str, "factor": num, "offset": num?}     x*factor+offset (units/currency)
    combine           {"columns": [str,...], "into": str, "how": sum|product|concat, "sep": str?}
    split             {"column": str, "into_columns": [str,...], "sep": str}
    recode            {"column": str, "mapping": [{"from":.., "to":..}], "default"?}   remap category values
    parse_date        {"column": str, "format": str?, "dayfirst": bool?}   force a date parse
    pivot             {"index": str, "columns": str, "values": str, "aggfunc": sum|mean?}  long -> wide

Applied in list order (a later op sees the output of earlier ones). A transform that
references a missing column or has invalid params is reported as an error and skipped —
the raw frame is left as it was for that step, never silently corrupted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from mmm_core.ingestion.quality import QualityReport, Severity

SUPPORTED_TRANSFORMS = {
    "rename",
    "drop_columns",
    "filter_rows",
    "drop_duplicates",
    "scale",
    "combine",
    "split",
    "recode",
    "parse_date",
    "pivot",
}

_COMPARATORS = {"eq", "ne", "lt", "le", "gt", "ge", "in", "not_in", "contains"}


@dataclass(frozen=True)
class TransformSpec:
    """One raw-table transform (see module docstring for the op catalogue)."""

    op: str
    params: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.op not in SUPPORTED_TRANSFORMS:
            raise ValueError(
                f"unknown transform op {self.op!r}; use one of {sorted(SUPPORTED_TRANSFORMS)}"
            )


def _need(params: dict, key: str, op: str) -> Any:
    if params.get(key) is None:
        raise ValueError(f"transform {op!r} needs a {key!r} parameter")
    return params[key]


def _require_columns(df: pd.DataFrame, cols: list[str], op: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"transform {op!r}: unknown column(s) {missing}")


def _filter_mask(df: pd.DataFrame, params: dict) -> pd.Series:
    col = _need(params, "column", "filter_rows")
    _require_columns(df, [col], "filter_rows")
    compare = _need(params, "compare", "filter_rows")
    if compare not in _COMPARATORS:
        raise ValueError(f"filter_rows: unknown comparator {compare!r}; use one of {sorted(_COMPARATORS)}")
    series = df[col]
    if compare in {"in", "not_in"}:
        values = params.get("values")
        if not isinstance(values, (list, tuple)):
            raise ValueError("filter_rows 'in'/'not_in' needs a 'values' list")
        mask = series.isin(list(values))
        return ~mask if compare == "not_in" else mask
    if compare == "contains":
        return series.astype(str).str.contains(str(_need(params, "value", "filter_rows")), na=False)

    value = params.get("value")
    # Numeric comparisons coerce both sides; equality falls back to string compare so a
    # category label ("promo") works as well as a number.
    if compare in {"lt", "le", "gt", "ge"}:
        left = pd.to_numeric(series, errors="coerce")
        right = float(value)
        ops = {"lt": left < right, "le": left <= right, "gt": left > right, "ge": left >= right}
        return ops[compare].fillna(False)
    eq = series.astype(str) == str(value)
    return ~eq if compare == "ne" else eq


def apply_transform(spec: TransformSpec, df: pd.DataFrame) -> pd.DataFrame:
    """Apply one transform, returning a new frame. Raises ``ValueError`` on bad params."""
    p = spec.params
    op = spec.op

    if op == "rename":
        src, dst = _need(p, "from", op), _need(p, "to", op)
        _require_columns(df, [src], op)
        return df.rename(columns={src: dst})

    if op == "drop_columns":
        cols = _need(p, "columns", op)
        return df.drop(columns=[c for c in cols if c in df.columns])

    if op == "filter_rows":
        return df.loc[_filter_mask(df, p)].copy()

    if op == "drop_duplicates":
        subset = p.get("subset")
        if subset:
            _require_columns(df, list(subset), op)
        return df.drop_duplicates(subset=list(subset) if subset else None).copy()

    if op == "scale":
        col = _need(p, "column", op)
        _require_columns(df, [col], op)
        factor = float(_need(p, "factor", op))
        offset = float(p.get("offset") or 0.0)
        out = df.copy()
        out[col] = pd.to_numeric(out[col], errors="coerce") * factor + offset
        return out

    if op == "combine":
        cols = _need(p, "columns", op)
        into = _need(p, "into", op)
        how = p.get("how") or "sum"
        _require_columns(df, list(cols), op)
        out = df.copy()
        if how == "concat":
            sep = str(p.get("sep") or "")
            out[into] = df[list(cols)].astype(str).agg(sep.join, axis=1)
        elif how == "product":
            out[into] = df[list(cols)].apply(pd.to_numeric, errors="coerce").prod(axis=1)
        elif how == "sum":
            out[into] = df[list(cols)].apply(pd.to_numeric, errors="coerce").sum(axis=1)
        else:
            raise ValueError(f"combine 'how' must be sum/product/concat, got {how!r}")
        return out

    if op == "split":
        col = _need(p, "column", op)
        into_cols = _need(p, "into_columns", op)
        sep = _need(p, "sep", op)
        _require_columns(df, [col], op)
        parts = df[col].astype(str).str.split(sep, expand=True)
        out = df.copy()
        for i, name in enumerate(into_cols):
            out[name] = parts[i] if i in parts.columns else np.nan
        return out

    if op == "recode":
        col = _need(p, "column", op)
        _require_columns(df, [col], op)
        pairs = _need(p, "mapping", op)
        lookup = {str(m["from"]): m["to"] for m in pairs}
        default = p.get("default")
        mapped = df[col].astype(str).map(lookup)
        out = df.copy()
        out[col] = mapped.where(mapped.notna(), default if default is not None else df[col])
        return out

    if op == "parse_date":
        col = _need(p, "column", op)
        _require_columns(df, [col], op)
        fmt = p.get("format")
        dayfirst = bool(p.get("dayfirst") or False)
        out = df.copy()
        if fmt:
            out[col] = pd.to_datetime(out[col], format=fmt, errors="coerce")
        else:
            out[col] = pd.to_datetime(out[col], dayfirst=dayfirst, errors="coerce")
        return out

    if op == "pivot":
        index, columns, values = _need(p, "index", op), _need(p, "columns", op), _need(p, "values", op)
        _require_columns(df, [index, columns, values], op)
        aggfunc = p.get("aggfunc") or "sum"
        if aggfunc not in {"sum", "mean"}:
            raise ValueError(f"pivot 'aggfunc' must be sum/mean, got {aggfunc!r}")
        wide = pd.pivot_table(df, index=index, columns=columns, values=values, aggfunc=aggfunc)
        wide.columns = [str(c) for c in wide.columns]
        return wide.reset_index()

    raise ValueError(f"unknown transform op {op!r}")  # pragma: no cover


def apply_transforms(
    df: pd.DataFrame,
    specs: list[TransformSpec],
    report: QualityReport,
    source_name: str,
) -> pd.DataFrame:
    """Apply an ordered list of transforms to a raw source frame.

    Each op that fails (bad params, missing column) is reported as an error and skipped,
    leaving the frame unchanged for that step; the rest still run so the builder sees as
    much progress — and as many distinct problems — as possible in one pass.
    """
    for spec in specs:
        try:
            df = apply_transform(spec, df)
            report.add(
                "transform_applied", Severity.INFO,
                f"applied transform {spec.op!r}",
                source=source_name, op=spec.op, params=spec.params,
            )
        except Exception as exc:
            report.add(
                "transform_error", Severity.ERROR,
                f"transform {spec.op!r} could not be applied: {exc}",
                source=source_name, op=spec.op,
            )
    return df
