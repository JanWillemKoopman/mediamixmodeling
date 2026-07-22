"""Data contracts: how a caller describes each uploaded source and its columns.

A "source" is one uploaded file (a DataFrame) — e.g. Google spend, Facebook spend,
or the KPI/revenue export. Each value column carries a *role*, which fixes how it is
aggregated to ISO-week level and how missing values are treated downstream.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    """The role of a value column, which determines its aggregation and imputation."""

    KPI = "kpi"          # target to explain: revenue, leads, conversions — summed per week
    SPEND = "spend"      # media spend per channel — summed per week, missing weeks -> 0
    CONTROL = "control"  # exogenous control: price, temperature, ... — averaged per week


# Aggregation method per role when collapsing daily/irregular rows to one ISO-week.
# Flows (spend, conversions, revenue) sum; levels/rates (price) average.
_AGGREGATION: dict[Role, str] = {
    Role.KPI: "sum",
    Role.SPEND: "sum",
    Role.CONTROL: "mean",
}


def aggregation_for(role: Role) -> str:
    """Return the pandas aggregation function name ('sum'/'mean') for a role."""
    return _AGGREGATION[role]


# Fill strategies allowed for a control column with gaps inside the analysis window.
# None (default) keeps the original behaviour: leave the gap as NaN and warn — the model
# will then refuse to fit until it is resolved, which is the safe default.
_CONTROL_FILL_STRATEGIES = ("zero", "ffill", "bfill", "interpolate", "mean", "median")


@dataclass(frozen=True)
class ColumnSpec:
    """One value column within a source.

    Args:
        name: Column name as it appears in the uploaded file.
        role: How to aggregate/impute it (see :class:`Role`).
        output_name: Name to use in the master table. Defaults to ``name``; if two
            sources resolve to the same output name the pipeline auto-prefixes both
            with their source name and records a collision warning.
        fill: For control columns only — how to fill missing weeks inside the analysis
            window (``zero``/``ffill``/``bfill``/``interpolate``/``mean``/``median``).
            ``None`` leaves gaps as NaN (the model then refuses to fit them).
    """

    name: str
    role: Role
    output_name: str | None = None
    fill: str | None = None

    def __post_init__(self) -> None:
        if self.fill is not None and self.fill not in _CONTROL_FILL_STRATEGIES:
            raise ValueError(
                f"unknown fill strategy {self.fill!r}; use one of {_CONTROL_FILL_STRATEGIES}"
            )
        if self.fill is not None and self.role is not Role.CONTROL:
            raise ValueError("fill is only meaningful for control columns")

    def resolved_name(self) -> str:
        return self.output_name or self.name


@dataclass(frozen=True)
class SourceSpec:
    """One uploaded file and the columns we want to keep from it.

    Args:
        name: Short identifier for the source (e.g. ``"google"``). Used for messages
            and as a prefix when resolving column-name collisions.
        columns: The value columns to extract; every other column (except the date)
            is dropped.
        date_column: Name of the date column. ``None`` means auto-detect.
        essential: Whether this source must have data for a week to count as part of
            the overlapping analysis window. KPI and spend sources are essential;
            optional controls can set this to ``False``.
    """

    name: str
    columns: tuple[ColumnSpec, ...]
    date_column: str | None = None
    essential: bool = True

    def __post_init__(self) -> None:
        if not self.columns:
            raise ValueError(f"source {self.name!r} must declare at least one column")
        seen: set[str] = set()
        for col in self.columns:
            resolved = col.resolved_name()
            if resolved in seen:
                raise ValueError(
                    f"source {self.name!r} maps two columns to the same output "
                    f"name {resolved!r}"
                )
            seen.add(resolved)
