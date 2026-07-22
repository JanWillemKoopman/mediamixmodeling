"""Date-column detection and ISO-week assignment.

We deliberately keep auto-detection conservative: parsing an integer column as a
date (pandas will happily read small ints as nanoseconds since 1970) is a classic
source of silent corruption, so numeric columns are only accepted when they clearly
look like ``YYYYMMDD``.
"""

from __future__ import annotations

import warnings

import pandas as pd
from pandas.api import types as pdt

# Name fragments that hint a column holds a date. Used only as a tie-breaker; a hint
# never overrides the requirement that the values actually parse to plausible dates.
_DATE_HINTS = (
    "date", "datum", "day", "dag", "week", "time", "tijd",
    "period", "periode", "month", "maand", "jaar", "year",
)

# Plausible calendar range for detected dates. Anything mostly outside this is rejected.
_MIN_YEAR = 1990
_MAX_YEAR = 2100

# Fraction of non-null values that must parse (and be plausible) for a column to qualify.
_PARSE_THRESHOLD = 0.8


def _try_parse(series: pd.Series) -> pd.Series:
    """Best-effort parse of a column to datetime, returning NaT for failures."""
    if pdt.is_datetime64_any_dtype(series):
        return pd.to_datetime(series, errors="coerce")

    if pdt.is_numeric_dtype(series):
        # Only accept the unambiguous YYYYMMDD integer form; refuse everything else.
        as_str = series.dropna().astype("int64").astype(str)
        if not as_str.empty and (as_str.str.fullmatch(r"\d{8}")).all():
            return pd.to_datetime(series.astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
        return pd.Series(pd.NaT, index=series.index)

    # object / string columns: let pandas infer the format per-column. We probe
    # arbitrary columns during auto-detection, so silence the "could not infer format"
    # notice — a non-date column simply coerces to NaT, which is what we want.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return pd.to_datetime(series, errors="coerce", format="mixed")


def _score(series: pd.Series) -> float:
    """Return the fraction of non-null values that parse to a *plausible* date."""
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    parsed = _try_parse(series)
    parsed_non_null = parsed.loc[non_null.index]
    ok = parsed_non_null.notna()
    if not ok.any():
        return 0.0
    years = parsed_non_null[ok].dt.year
    plausible = years.between(_MIN_YEAR, _MAX_YEAR)
    return float(plausible.sum()) / float(len(non_null))


def detect_date_column(df: pd.DataFrame, explicit: str | None = None) -> str:
    """Return the name of the date column.

    If ``explicit`` is given it is validated (must exist and parse); otherwise every
    column is scored and the best-parsing one wins, with name hints breaking ties.

    Raises:
        KeyError: an explicit column is not present.
        ValueError: the explicit column does not parse, or no column qualifies.
    """
    if explicit is not None:
        if explicit not in df.columns:
            raise KeyError(f"date column {explicit!r} not found in source")
        if _score(df[explicit]) < _PARSE_THRESHOLD:
            raise ValueError(f"date column {explicit!r} could not be parsed as dates")
        return explicit

    best_col: str | None = None
    best_key: tuple[bool, float] = (False, 0.0)
    for col in df.columns:
        score = _score(df[col])
        if score < _PARSE_THRESHOLD:
            continue
        hint = any(h in str(col).lower() for h in _DATE_HINTS)
        key = (hint, score)
        if best_col is None or key > best_key:
            best_col, best_key = col, key

    if best_col is None:
        raise ValueError(
            "could not auto-detect a date column; pass date_column explicitly on the SourceSpec"
        )
    return best_col


def to_week_start(dates: pd.Series) -> pd.Series:
    """Map each datetime to the Monday of its ISO week (midnight, tz-naive).

    Using the Monday date rather than an ``(iso_year, iso_week)`` tuple keeps joins and
    ordering trivial and sidesteps the ISO-year-boundary edge cases where week 1 or 52/53
    belong to the neighbouring calendar year.
    """
    dt = pd.to_datetime(dates)
    return (dt - pd.to_timedelta(dt.dt.weekday, unit="D")).dt.normalize()
