"""Event dummies: config-level 0/1 control columns for anomalous weeks.

Some weeks are structural outliers — an anomaly in the source data, a one-off
promotion, a site migration — and the honest way to handle them is not to invent a
"normal" value but to let the model absorb that week explicitly through a control
column. Declaring the affected ISO weeks in the job config lets a builder do this
without hand-editing the raw source file to add a dummy column.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class EventDummySpec:
    """One named 0/1 control column, active on the given ISO weeks.

    Args:
        name: Output column name in the master dataset (added with role CONTROL).
        weeks: ``(iso_year, iso_week)`` pairs the dummy is 1 for; 0 everywhere else.
    """

    name: str
    weeks: tuple[tuple[int, int], ...]

    def __post_init__(self) -> None:
        if not self.weeks:
            raise ValueError(f"event dummy {self.name!r} must specify at least one week")

    def week_starts(self) -> list[pd.Timestamp]:
        """The (Monday) ``week_start`` dates this dummy is active for."""
        return [pd.Timestamp.fromisocalendar(year, week, 1) for year, week in self.weeks]


def build_event_dummy(index: pd.DatetimeIndex, spec: EventDummySpec) -> pd.Series:
    """A 0.0/1.0 series aligned to ``index``, 1.0 on ``spec``'s weeks."""
    active = spec.week_starts()
    return pd.Series(index.isin(active).astype(float), index=index, name=spec.name)
