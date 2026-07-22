"""Build one aligned ISO-week master dataset from several uploaded sources.

Pipeline (per the agreed methodology, with one deliberate ordering fix):

    1. Per source: detect & parse the date column, drop unparseable rows, flag
       duplicate raw rows, assign each row to an ISO week (Monday), and aggregate
       to week level (sum for KPI/spend, mean for controls).
    2. Resolve column-name collisions across sources (auto-prefix + warn).
    3. Outer-join all weekly sources on the week (Monday) index.
    4. Determine the overlapping analysis window from the *essential* sources
       (the period in which every essential source has data).
    5. Trim to that window and reindex onto a gap-free weekly grid.
    6. **Window-first imputation**: only now impute missing spend weeks with 0, so we
       never invent zero-spend weeks *before a channel existed* (which would bias
       adstock/saturation). Warn — never silently fill — on gaps in KPI/control data.
    7. Post-join checks: near-identical channels (correlation) and year-end anomalies.

Everything suspicious is reported on :class:`QualityReport`; the numbers themselves are
only ever aggregated or zero-imputed within the window, never fabricated.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from mmm_core.ingestion.dates import detect_date_column, to_week_start
from mmm_core.ingestion.events import EventDummySpec, build_event_dummy
from mmm_core.ingestion.feature_engineering import FeatureSpec, build_feature
from mmm_core.ingestion.quality import QualityReport, Severity
from mmm_core.ingestion.spec import Role, SourceSpec, aggregation_for
from mmm_core.ingestion.transforms import TransformSpec, apply_transforms

# A robust-z threshold above which a year-end KPI point is flagged as a possible anomaly.
_ANOMALY_Z = 5.0
# Default Pearson correlation above which two spend channels are flagged near-identical.
_DEFAULT_CORR_THRESHOLD = 0.95


@dataclass
class BuildResult:
    """The aligned master dataset and everything learned while building it."""

    data: pd.DataFrame                      # index: week_start (Monday), sorted, gap-free
    window: tuple[pd.Timestamp, pd.Timestamp] | None
    report: QualityReport
    column_roles: dict[str, Role] = field(default_factory=dict)
    sources: list[str] = field(default_factory=list)

    def columns_with_role(self, role: Role) -> list[str]:
        return [name for name, r in self.column_roles.items() if r is role]


# Currency symbols and (non-breaking) spaces stripped before locale-aware numeric parsing.
_CURRENCY_CHARS = re.compile(r"[€$£\s ]")
# "1.234,56" / "1234,56" — dot as thousands separator, comma as decimal (NL/EU exports).
_NL_NUMBER = re.compile(r"^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+(,\d+)?$")
# "1,234.56" — comma as thousands separator (EN exports).
_EN_NUMBER = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")


def _coerce_numeric(series: pd.Series, spec_name: str, col_name: str, report: QualityReport) -> pd.Series:
    """Parse a value column to numbers, understanding EU/NL currency formatting.

    Dutch spend exports arrive as "€ 1.234,56"; plain ``pd.to_numeric`` turns those into
    NaN, which the window imputation later silently converts to 0 spend — the single most
    dangerous silent failure this pipeline had. Strategy: try plain parsing first; only
    for columns where that leaves failures, strip currency symbols and detect the locale
    from the failing values themselves. A locale reparse is accepted only when it makes
    ≥80% of the non-empty values parseable, and it is reported (``currency_parsed``) so
    the conversion is never invisible.
    """
    numeric = pd.to_numeric(series, errors="coerce")
    if series.dtype.kind in "biufc":  # already numeric — nothing to detect
        return numeric

    raw = series.astype("string").str.strip()
    nonempty = raw.notna() & (raw != "")
    n_nonempty = int(nonempty.sum())
    failed = nonempty & numeric.isna()
    if n_nonempty == 0 or not failed.any():
        return numeric

    cleaned = raw.where(~nonempty, raw).str.replace(_CURRENCY_CHARS, "", regex=True)
    failing_values = cleaned[failed]
    nl_share = float(failing_values.str.match(_NL_NUMBER).fillna(False).mean())
    en_share = float(failing_values.str.match(_EN_NUMBER).fillna(False).mean())

    reparsed: pd.Series | None = None
    style: str | None = None
    if nl_share >= 0.8 and nl_share >= en_share:
        # NL style must be applied to the WHOLE column: "1.234" is 1234 in an NL column,
        # and plain to_numeric would have (mis)read it as 1.234 — per-column consistency
        # beats keeping the accidental parse.
        nl = cleaned.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
        reparsed, style = pd.to_numeric(nl, errors="coerce"), "NL (1.234,56)"
    elif en_share >= 0.8:
        en = cleaned.str.replace(",", "", regex=False)
        reparsed, style = pd.to_numeric(en, errors="coerce"), "EN (1,234.56)"
    elif float(pd.to_numeric(cleaned, errors="coerce").notna().mean()) >= 0.8:
        # Only currency symbols/spaces were in the way (e.g. "€ 1234.56").
        reparsed, style = pd.to_numeric(cleaned, errors="coerce"), "valuta-notatie"

    if reparsed is None:
        return numeric
    success = float(reparsed[nonempty].notna().mean())
    plain_success = float(numeric[nonempty].notna().mean())
    if success < 0.8 or success <= plain_success:
        return numeric

    example = str(raw[failed].iloc[0])
    n_converted = int(failed.sum())
    report.add(
        "currency_parsed", Severity.INFO,
        f"column {col_name!r} contains formatted numbers (e.g. {example!r}); parsed as "
        f"{style} — check a few values in the preview to confirm the conversion",
        source=spec_name, column=col_name, count=n_converted, example=example, style=style,
    )
    return reparsed


def _flag_duplicate_dates(
    spec: SourceSpec, dates: pd.Series, df: pd.DataFrame, report: QualityReport
) -> None:
    """Warn when a source has multiple *different* rows for the same date.

    Fully-identical duplicate rows are already flagged separately; different rows on the
    same date are the classic double-count trap (a total row next to detail rows, or an
    export that repeats the last day). Aggregation will silently sum them, so the builder
    must at least be told it happened.
    """
    if dates.empty:
        return
    dup_date_mask = dates.duplicated(keep=False)
    if not dup_date_mask.any():
        return
    # Different-content rows only: drop rows that are complete duplicates of another row.
    distinct = df.loc[dup_date_mask].drop_duplicates()
    counts = dates.loc[distinct.index].value_counts()
    conflicting = counts[counts > 1]
    if conflicting.empty:
        return
    example = conflicting.index[0]
    example_label = example.date().isoformat() if hasattr(example, "date") else str(example)
    report.add(
        "duplicate_dates_aggregated", Severity.WARNING,
        f"{len(conflicting)} date(s) have multiple different rows (e.g. {example_label} "
        f"with {int(conflicting.iloc[0])} rows); their values are summed — check for "
        f"double counting (e.g. a total row next to detail rows)",
        source=spec.name, count=int(conflicting.sum()), n_dates=len(conflicting),
        example_date=example_label,
    )


def _flag_partial_edge_weeks(
    spec: SourceSpec, week_of_row: pd.Series, report: QualityReport
) -> None:
    """Warn when the first/last ISO week of a sub-weekly source is only partially covered.

    A daily export that starts on a Thursday or ends mid-week yields a first/last week
    holding a fraction of the usual rows; summing it silently understates exactly the
    most recent datapoint. Only meaningful for sources with multiple rows per week
    (median rows/week ≥ 2) — a weekly file trivially has 1 row per week.
    """
    if week_of_row.empty:
        return
    per_week = week_of_row.value_counts().sort_index()
    if len(per_week) < 3:
        return
    median_rows = float(per_week.iloc[1:-1].median())  # interior weeks set the norm
    if median_rows < 2:
        return
    partial = []
    for label, position in ((per_week.index[0], "first"), (per_week.index[-1], "last")):
        if per_week.loc[label] < 0.6 * median_rows:
            partial.append((position, label, int(per_week.loc[label])))
    for position, label, n_rows in partial:
        report.add(
            "partial_edge_week", Severity.WARNING,
            f"the {position} week ({label.date().isoformat()}) of source {spec.name!r} "
            f"covers only {n_rows} row(s) where interior weeks have ~{median_rows:.0f}; "
            f"its aggregated value will be understated — consider trimming this week",
            source=spec.name, week=label.date().isoformat(), rows=n_rows,
            median_rows=median_rows,
        )


def _flag_coarse_cadence(spec: SourceSpec, dates: pd.Series, report: QualityReport) -> None:
    """Warn when a source's native cadence is coarser than weekly (e.g. monthly data).

    A monthly file forced onto a weekly grid contributes ~1 real row per 4 weeks; the other
    3 weeks become gaps (KPI) or zero-imputed (spend), which silently distorts every weekly
    model. The median gap between consecutive unique dates reveals the true cadence: ~7 days
    is weekly, ~28-31 days is monthly. Only flags clearly-coarse cadences (median gap > 10
    days) so ordinary weekly/daily data never trips it.
    """
    unique_days = pd.Series(pd.to_datetime(dates)).dt.normalize().drop_duplicates().sort_values()
    if len(unique_days) < 3:
        return
    median_gap = float(unique_days.diff().dropna().dt.days.median())
    if median_gap <= 10:
        return
    cadence = "maandelijks" if median_gap >= 24 else f"~{median_gap:.0f}-daags"
    report.add(
        "coarse_cadence", Severity.WARNING,
        f"source {spec.name!r} has a {cadence} cadence (median {median_gap:.0f} days between "
        f"rows); forced onto a weekly grid most weeks will be empty or zero-imputed, which "
        f"distorts the weekly model — aggregate the KPI/spend to the same cadence or model "
        f"at that resolution",
        source=spec.name, median_gap_days=median_gap,
    )


def _prepare_source(
    spec: SourceSpec, df: pd.DataFrame, report: QualityReport
) -> tuple[pd.DataFrame, dict[str, Role], dict[str, str]]:
    """Clean, date-index and aggregate a single source to ISO-week level."""
    df = df.copy()

    date_col = detect_date_column(df, spec.date_column)
    if spec.date_column is None:
        report.add(
            "date_column_detected", Severity.INFO,
            f"auto-detected date column {date_col!r}", source=spec.name, column=date_col,
        )

    n_dup = int(df.duplicated().sum())
    if n_dup:
        report.add(
            "duplicate_rows", Severity.WARNING,
            f"{n_dup} duplicate raw row(s) found and kept (they will aggregate together)",
            source=spec.name, count=n_dup,
        )

    parsed = pd.to_datetime(df[date_col], errors="coerce")
    n_bad = int(parsed.isna().sum())
    if n_bad:
        report.add(
            "unparseable_dates", Severity.WARNING,
            f"{n_bad} row(s) with unparseable dates were dropped",
            source=spec.name, count=n_bad,
        )
    keep = parsed.notna()
    df = df.loc[keep].copy()
    df["_week"] = to_week_start(parsed.loc[keep])

    _flag_duplicate_dates(spec, parsed.loc[keep], df.drop(columns=["_week"]), report)
    _flag_partial_edge_weeks(spec, df["_week"], report)
    _flag_coarse_cadence(spec, parsed.loc[keep], report)

    agg: dict[str, str] = {}
    roles: dict[str, Role] = {}
    fills: dict[str, str] = {}
    for col in spec.columns:
        if col.name not in df.columns:
            report.add(
                "missing_column", Severity.ERROR,
                f"declared column {col.name!r} is not present in the source",
                source=spec.name, column=col.name,
            )
            continue
        numeric = _coerce_numeric(df[col.name], spec.name, col.name, report)
        n_nan = int(numeric.isna().sum())
        if n_nan:
            report.add(
                "non_numeric_values", Severity.INFO,
                f"{n_nan} non-numeric/missing value(s) in {col.name!r} treated as missing",
                source=spec.name, column=col.name, count=n_nan,
            )
        df[col.name] = numeric
        agg[col.name] = aggregation_for(col.role)
        roles[col.resolved_name()] = col.role
        if col.fill is not None:
            fills[col.resolved_name()] = col.fill

    if not agg:
        # Every declared column was missing — return an empty, correctly-typed frame.
        empty = pd.DataFrame(index=pd.DatetimeIndex([], name="week_start"))
        return empty, roles, fills

    weekly = df.groupby("_week").agg(agg)
    weekly = weekly.rename(columns={c.name: c.resolved_name() for c in spec.columns if c.name in agg})
    weekly.index.name = "week_start"
    return weekly.sort_index(), roles, fills


def _resolve_collisions(
    weekly_by_source: dict[str, pd.DataFrame],
    roles_by_source: dict[str, dict[str, Role]],
    fills_by_source: dict[str, dict[str, str]],
    report: QualityReport,
) -> tuple[dict[str, pd.DataFrame], dict[str, Role], dict[str, str]]:
    """Prefix column names that appear in more than one source, and merge role/fill maps."""
    owners: dict[str, list[str]] = defaultdict(list)
    for src, weekly in weekly_by_source.items():
        for name in weekly.columns:
            owners[name].append(src)

    renamed: dict[str, pd.DataFrame] = {}
    merged_roles: dict[str, Role] = {}
    merged_fills: dict[str, str] = {}
    for src, weekly in weekly_by_source.items():
        rename_map: dict[str, str] = {}
        for name in weekly.columns:
            final = f"{src}_{name}" if len(owners[name]) > 1 else name
            if final != name:
                rename_map[name] = final
            merged_roles[final] = roles_by_source[src][name]
            if name in fills_by_source.get(src, {}):
                merged_fills[final] = fills_by_source[src][name]
        if rename_map:
            report.add(
                "column_name_collision", Severity.WARNING,
                f"column(s) {sorted(rename_map)} exist in multiple sources; "
                f"prefixed with source name in {src!r}",
                source=src, renamed=rename_map,
            )
        renamed[src] = weekly.rename(columns=rename_map)
    return renamed, merged_roles, merged_fills


def _flag_near_identical(
    data: pd.DataFrame, spend_cols: list[str], threshold: float, report: QualityReport
) -> None:
    """Warn on pairs of spend channels whose weekly series are near-identical."""
    usable = [c for c in spend_cols if data[c].std(skipna=True) and data[c].notna().sum() > 2]
    if len(usable) < 2:
        return
    corr = data[usable].corr()
    for i, a in enumerate(usable):
        for b in usable[i + 1:]:
            r = corr.loc[a, b]
            if pd.notna(r) and abs(r) >= threshold:
                report.add(
                    "near_identical_channels", Severity.WARNING,
                    f"channels {a!r} and {b!r} are near-identical (r={r:.3f}); raw "
                    f"correlation can mislead — they may be confounded, not causal",
                    columns=[a, b], correlation=float(r),
                )


def _flag_year_end_anomalies(
    data: pd.DataFrame, kpi_cols: list[str], report: QualityReport
) -> None:
    """Warn on extreme KPI values landing in the turn-of-year weeks (52/53/1)."""
    iso = data.index.isocalendar()
    turn_of_year = iso["week"].isin([1, 52, 53]).to_numpy()
    for col in kpi_cols:
        series = data[col]
        clean = series.dropna()
        if len(clean) < 8:
            continue
        median = clean.median()
        mad = (clean - median).abs().median()
        # Robust scale via the MAD; fall back to the std for a (near-)constant baseline
        # with a single spike, where the MAD collapses to 0 but the spike is still real.
        scale = mad * 1.4826 if mad > 0 else clean.std(ddof=0)
        if not scale or np.isnan(scale):
            continue
        robust_z = (series - median) / scale
        flagged = turn_of_year & (robust_z.abs().to_numpy() > _ANOMALY_Z)
        if flagged.any():
            weeks = [ts.date().isoformat() for ts in data.index[flagged]]
            report.add(
                "year_end_anomaly", Severity.WARNING,
                f"{col!r} has extreme value(s) in turn-of-year week(s) {weeks}; "
                f"consider an event dummy or excluding these weeks",
                column=col, weeks=weeks,
            )


def _flag_kpi_outliers(data: pd.DataFrame, kpi_cols: list[str], report: QualityReport) -> None:
    """Warn on individual weeks that stand out sharply against their local neighbours.

    :func:`_flag_year_end_anomalies` only looks at turn-of-year weeks with a global
    median/MAD, so a mid-year spike on a multi-year, trending KPI slips through
    unreported: the AI architect then only sees the dataset's head/tail preview and an
    aggregate max, and can't name the actual outlier week. This runs a local (rolling-
    window) robust-z test across the *whole* window instead, so a one-off spike is
    reported by name (week + value) regardless of where it falls in the year or how
    much the series has drifted since.
    """
    from mmm_core.features import flag_local_outliers

    for col in kpi_cols:
        series = data[col]
        if series.notna().sum() < 8:
            continue
        flagged = flag_local_outliers(series).fillna(False).to_numpy()
        if flagged.any():
            weeks = [ts.date().isoformat() for ts in data.index[flagged]]
            values = [float(v) for v in series[flagged]]
            report.add(
                "kpi_outlier_weeks", Severity.WARNING,
                f"{col!r} has locally anomalous value(s) in week(s) {weeks} "
                f"(values {values}); consider an event dummy for the specific week(s)",
                column=col, weeks=weeks, values=values,
            )


def _flag_predictor_outliers(
    data: pd.DataFrame, spend_cols: list[str], control_cols: list[str], report: QualityReport
) -> None:
    """Flag locally anomalous weeks in spend/control columns (INFO, not WARNING).

    Same local robust-z test as :func:`_flag_kpi_outliers`, extended to the predictors so a
    data-entry spike in a spend or control column (a double-booked invoice, a units-vs-euros
    mix-up) is surfaced by name. Deliberately INFO, not WARNING: a spend burst is often
    genuine (a campaign launch), so this informs rather than alarms — the builder decides
    whether it is an error or a real event worth an event dummy.
    """
    from mmm_core.features import flag_local_outliers

    for col in spend_cols + control_cols:
        series = data[col]
        if series.notna().sum() < 8:
            continue
        flagged = flag_local_outliers(series).fillna(False).to_numpy()
        if flagged.any():
            weeks = [ts.date().isoformat() for ts in data.index[flagged]]
            values = [float(v) for v in series[flagged]]
            kind = "spend" if col in spend_cols else "control"
            report.add(
                "predictor_outlier_weeks", Severity.INFO,
                f"{kind} column {col!r} has locally unusual value(s) in week(s) {weeks} "
                f"(values {values}); check whether this is a real event or a data error",
                column=col, weeks=weeks, values=values, role=kind,
            )


# VIF above which a predictor is flagged as (near-)collinear with the others. 10 is the
# textbook "serious multicollinearity" line; it catches group collinearity that pairwise
# correlation (near_identical_channels) misses — e.g. three channels that each look fine
# pairwise but where one is nearly the sum of the other two.
_VIF_THRESHOLD = 10.0


def _flag_multicollinearity(
    data: pd.DataFrame, spend_cols: list[str], control_cols: list[str], report: QualityReport
) -> None:
    """Flag predictors with a high Variance Inflation Factor (group multicollinearity).

    VIF_i = 1 / (1 - R²_i), where R²_i is from regressing predictor i on all the others.
    A high VIF means predictor i is well-explained by the rest, so the model cannot pin
    down its individual coefficient — the exact failure MMM budget advice is most sensitive
    to. Uses numpy least squares (no new dependency). Needs enough weeks to be meaningful.
    """
    cols = spend_cols + control_cols
    if len(cols) < 3:
        return  # VIF needs ≥2 "other" predictors to regress against
    sub = data[cols].dropna()
    # Keep only non-constant columns (a constant has no variance to inflate and is already
    # flagged as zero_variance_column).
    usable = [c for c in cols if sub[c].std(ddof=0) > 0]
    if len(usable) < 3 or len(sub) <= len(usable) + 1:
        return
    x = sub[usable].to_numpy(dtype=float)
    x = (x - x.mean(axis=0)) / x.std(axis=0, ddof=0)  # standardize for numerical stability
    flagged: list[tuple[str, float]] = []
    for i, col in enumerate(usable):
        others = np.delete(x, i, axis=1)
        design = np.column_stack([np.ones(len(others)), others])
        coef, *_ = np.linalg.lstsq(design, x[:, i], rcond=None)
        resid = x[:, i] - design @ coef
        ss_res = float(np.sum(resid ** 2))
        ss_tot = float(np.sum((x[:, i] - x[:, i].mean()) ** 2)) or 1.0
        r2 = 1.0 - ss_res / ss_tot
        vif = 1.0 / (1.0 - r2) if r2 < 1.0 else float("inf")
        if vif >= _VIF_THRESHOLD:
            flagged.append((col, vif))
    if flagged:
        names = [c for c, _ in flagged]
        worst = max(v for _, v in flagged)
        report.add(
            "multicollinearity", Severity.WARNING,
            f"predictor(s) {sorted(names)} are strongly collinear with the other predictors "
            f"(VIF up to {worst:.0f}); the model cannot separate their individual effects, so "
            f"per-channel ROI/contributions will be unstable — consider merging or dropping "
            f"one, or combining them into a total",
            columns=sorted(names), max_vif=round(worst, 1),
        )


def _flag_degenerate_columns(
    data: pd.DataFrame,
    spend_cols: list[str],
    kpi_cols: list[str],
    control_cols: list[str],
    report: QualityReport,
) -> None:
    """Warn on columns that break MMM assumptions: negative spend, all-zero channels and
    constant columns.

    Negative spend (refunds/credit corrections) makes adstock/saturation uninterpretable;
    an all-zero channel inside the window burns parameters on a channel that never ran;
    a constant KPI/control carries no information for the fit at all.
    """
    for col in spend_cols:
        series = data[col]
        negative = series < 0
        if negative.any():
            weeks = [ts.date().isoformat() for ts in data.index[negative.fillna(False)][:5]]
            report.add(
                "negative_spend", Severity.WARNING,
                f"spend column {col!r} has {int(negative.sum())} negative week(s) "
                f"(min {float(series.min()):.2f}, e.g. {weeks}); refunds/corrections break "
                f"adstock — clip to 0 or net them out before modelling",
                column=col, count=int(negative.sum()), weeks=weeks, min=float(series.min()),
            )

    for col in spend_cols:
        series = data[col].fillna(0.0)
        if len(series) > 0 and (series == 0).all():
            report.add(
                "all_zero_channel", Severity.WARNING,
                f"spend column {col!r} is zero for the entire analysis window; the model "
                f"cannot learn anything about this channel — remove it or check the merge",
                column=col,
            )

    for col in kpi_cols + control_cols:
        series = data[col].dropna()
        if len(series) >= 2 and series.nunique() <= 1:
            report.add(
                "zero_variance_column", Severity.WARNING,
                f"column {col!r} is constant over the whole window (value "
                f"{float(series.iloc[0]):.4g}); it carries no information for the model",
                column=col,
            )


# Weeks-per-channel thresholds for the over-parameterization guard: below _WPC_ERROR the
# channels cannot be separated at all (an error that blocks the merge), below _WPC_WARN
# the per-channel uncertainty will be very wide (a warning).
_WPC_ERROR = 4.0
_WPC_WARN = 8.0


def _flag_over_parameterization(
    n_weeks: int,
    spend_cols: list[str],
    kpi_cols: list[str],
    control_cols: list[str],
    report: QualityReport,
) -> None:
    """Guard against fitting more parameters than the data can support.

    Every spend channel costs multiple parameters (effect + adstock + saturation); as a
    rule of thumb an MMM needs ≥8 weeks per channel for usable per-channel estimates.
    Only judged when the dataset actually carries a KPI — a build without a KPI can never
    reach a fit, so the guard would only add noise there. This is the server-side twin of
    the client-side readiness verdict in lib/dataHealth.ts.
    """
    n_channels = len(spend_cols)
    if n_channels == 0 or n_weeks == 0 or not kpi_cols:
        return
    wpc = n_weeks / n_channels
    if wpc < _WPC_ERROR:
        report.add(
            "too_many_parameters", Severity.ERROR,
            f"{n_channels} channel(s) on {n_weeks} week(s) of data ({wpc:.1f} weeks per "
            f"channel, plus {len(control_cols)} control(s)) — far too little data to "
            f"separate the channels; add weeks or merge channels",
            n_weeks=n_weeks, n_channels=n_channels, n_controls=len(control_cols),
            weeks_per_channel=round(wpc, 2),
        )
    elif wpc < _WPC_WARN:
        report.add(
            "too_many_parameters", Severity.WARNING,
            f"{n_channels} channel(s) on {n_weeks} week(s) of data ({wpc:.1f} weeks per "
            f"channel) — expect wide per-channel uncertainty intervals",
            n_weeks=n_weeks, n_channels=n_channels, n_controls=len(control_cols),
            weeks_per_channel=round(wpc, 2),
        )


def _flag_window_trimming(
    weekly_by_source: dict[str, pd.DataFrame],
    essential_spans: dict[str, tuple[pd.Timestamp, pd.Timestamp]],
    window_start: pd.Timestamp,
    window_end: pd.Timestamp,
    report: QualityReport,
) -> None:
    """Explain *why* the analysis window is what it is, so "why was my period clipped?"
    is answerable from the quality report alone.

    Emits INFO issues (never blocking): ``window_boundary`` names the essential source(s)
    whose own span sets the start and/or the end of the window, and
    ``source_window_trimmed`` reports, per source, how many of its own weeks fall outside
    the shared window and are dropped. Uses the pre-trim per-source weekly frames, so the
    counts reflect real data that existed before alignment.
    """
    # Which essential source(s) pin each boundary (its own edge equals the window edge).
    starts_here = sorted(n for n, (lo, _) in essential_spans.items() if lo == window_start)
    ends_here = sorted(n for n, (_, hi) in essential_spans.items() if hi == window_end)
    if starts_here:
        report.add(
            "window_boundary", Severity.INFO,
            f"source(s) {starts_here} start on {window_start.date().isoformat()}, which "
            f"sets the start of the analysis window (earlier weeks of other sources are "
            f"dropped because there is no overlap yet)",
            sources=starts_here, boundary="start", date=window_start.date().isoformat(),
        )
    if ends_here:
        report.add(
            "window_boundary", Severity.INFO,
            f"source(s) {ends_here} end on {window_end.date().isoformat()}, which sets the "
            f"end of the analysis window (later weeks of other sources are dropped)",
            sources=ends_here, boundary="end", date=window_end.date().isoformat(),
        )

    # Per source: how many of its own weeks sit outside the shared window.
    for name, weekly in weekly_by_source.items():
        if weekly.empty:
            continue
        idx = weekly.index
        n_before = int((idx < window_start).sum())
        n_after = int((idx > window_end).sum())
        dropped = n_before + n_after
        if dropped == 0:
            continue
        report.add(
            "source_window_trimmed", Severity.INFO,
            f"source {name!r} loses {dropped} week(s) outside the shared window "
            f"({n_before} before {window_start.date().isoformat()}, {n_after} after "
            f"{window_end.date().isoformat()}); its data exists but no other source "
            f"covers those weeks",
            source=name, dropped=dropped, before=n_before, after=n_after,
        )


def _apply_event_dummies(
    data: pd.DataFrame,
    event_dummies: list[EventDummySpec],
    report: QualityReport,
) -> dict[str, Role]:
    """Attach one 0/1 control column per event dummy, post window-trim."""
    roles: dict[str, Role] = {}
    for spec in event_dummies:
        if spec.name in data.columns:
            report.add(
                "event_dummy_name_collision", Severity.ERROR,
                f"event dummy {spec.name!r} collides with an existing column name",
                column=spec.name,
            )
            continue
        dummy = build_event_dummy(data.index, spec)
        if dummy.sum() == 0:
            report.add(
                "event_dummy_outside_window", Severity.WARNING,
                f"event dummy {spec.name!r} has no active week inside the analysis "
                f"window ({data.index.min().date()}..{data.index.max().date()}); it "
                f"will be all zero and have no effect on the fit",
                column=spec.name, weeks=[f"{y}-W{w:02d}" for y, w in spec.weeks],
            )
        data[spec.name] = dummy.to_numpy()
        roles[spec.name] = Role.CONTROL
    return roles


def _apply_features(
    data: pd.DataFrame,
    features: list[FeatureSpec],
    report: QualityReport,
) -> dict[str, Role]:
    """Compute each derived feature against the master and attach it as a control column.

    Features are applied *after* event dummies (so a feature may reference a dummy) and in
    order (so a feature may build on an earlier one). A feature that references a missing
    column, collides with an existing name, or cannot be computed is reported as an error
    and skipped — never silently dropped.
    """
    roles: dict[str, Role] = {}
    for spec in features:
        if spec.name in data.columns:
            report.add(
                "feature_name_collision", Severity.ERROR,
                f"derived feature {spec.name!r} collides with an existing column name",
                column=spec.name,
            )
            continue
        try:
            series = build_feature(spec, data)
        except Exception as exc:
            report.add(
                "feature_error", Severity.ERROR,
                f"derived feature {spec.name!r} could not be computed: {exc}",
                column=spec.name,
            )
            continue
        data[spec.name] = series.to_numpy()
        roles[spec.name] = Role.CONTROL
        report.add(
            "feature_added", Severity.INFO,
            f"derived feature {spec.name!r} added as a control column (op={spec.op}, "
            f"inputs={list(spec.inputs)})",
            column=spec.name,
        )
    return roles


def build_master_dataset(
    sources: list[tuple[SourceSpec, pd.DataFrame]],
    *,
    correlation_threshold: float = _DEFAULT_CORR_THRESHOLD,
    impute_spend_zero: bool = True,
    event_dummies: list[EventDummySpec] | None = None,
    features: list[FeatureSpec] | None = None,
    source_transforms: dict[str, list[TransformSpec]] | None = None,
) -> BuildResult:
    """Align several uploaded sources into one gap-free ISO-week master dataset.

    Args:
        sources: ``(SourceSpec, DataFrame)`` pairs — one per uploaded file.
        correlation_threshold: Pearson |r| above which spend channels are flagged
            near-identical.
        impute_spend_zero: Whether to fill missing spend weeks with 0 *inside* the
            analysis window (recommended; a missing spend week means the channel ran
            no ads that week).
        event_dummies: Optional 0/1 control columns for named ISO weeks (anomalies,
            one-off promotions, ...), added after the window is trimmed so the
            builder never has to hand-edit a source file to flag one.
        features: Optional derived control columns computed from the aligned master
            (lags, rolling means, ratios/shares, interactions, transforms, recurring
            calendar dummies), applied after event dummies and in order.
        source_transforms: Optional per-source raw-table transforms (keyed by source
            name) — cleaning/reshaping (rename, filter, dedupe, unit conversion, combine/
            split, recode, force date parse, long->wide pivot) applied to each raw frame
            before role-mapping and weekly aggregation.

    Returns:
        A :class:`BuildResult`. If there is no overlapping window across the essential
        sources, ``window`` is ``None``, ``data`` is empty, and the report carries an
        error.
    """
    report = QualityReport()
    if not sources:
        raise ValueError("build_master_dataset requires at least one source")

    weekly_by_source: dict[str, pd.DataFrame] = {}
    roles_by_source: dict[str, dict[str, Role]] = {}
    fills_by_source: dict[str, dict[str, str]] = {}
    essential_spans: dict[str, tuple[pd.Timestamp, pd.Timestamp]] = {}

    transforms_by_source = source_transforms or {}
    for spec, df in sources:
        # Raw cleaning/reshaping first (rename, filter, unit conversion, pivot, ...), so the
        # role-mapping and weekly aggregation below see the tidied frame.
        pre = transforms_by_source.get(spec.name)
        if pre:
            df = apply_transforms(df, list(pre), report, spec.name)
        weekly, roles, fills = _prepare_source(spec, df, report)
        weekly_by_source[spec.name] = weekly
        roles_by_source[spec.name] = roles
        fills_by_source[spec.name] = fills
        if spec.essential and not weekly.empty:
            essential_spans[spec.name] = (weekly.index.min(), weekly.index.max())

    weekly_by_source, column_roles, column_fills = _resolve_collisions(
        weekly_by_source, roles_by_source, fills_by_source, report
    )

    # Outer-join everything first, so we can also see out-of-window coverage if needed.
    master: pd.DataFrame | None = None
    for weekly in weekly_by_source.values():
        if weekly.empty:
            continue
        master = weekly if master is None else master.join(weekly, how="outer")
    if master is None:
        master = pd.DataFrame(index=pd.DatetimeIndex([], name="week_start"))
    master = master.sort_index()

    source_names = [spec.name for spec, _ in sources]

    if not essential_spans:
        report.add(
            "no_essential_data", Severity.ERROR,
            "no essential source produced any data; cannot determine an analysis window",
        )
        return BuildResult(master, None, report, column_roles, source_names)

    window_start = max(span[0] for span in essential_spans.values())
    window_end = min(span[1] for span in essential_spans.values())
    if window_start > window_end:
        report.add(
            "no_overlap", Severity.ERROR,
            "essential sources do not overlap in time; no common analysis window exists",
            window_start=str(window_start.date()), window_end=str(window_end.date()),
        )
        return BuildResult(master, None, report, column_roles, source_names)

    # Explain the window (which source pins each edge, which sources lose weeks) before
    # trimming — uses the pre-trim per-source frames.
    _flag_window_trimming(weekly_by_source, essential_spans, window_start, window_end, report)

    # Trim to the window and reindex onto a gap-free weekly (Monday) grid.
    full_index = pd.date_range(window_start, window_end, freq="7D", name="week_start")
    data = master.loc[window_start:window_end].reindex(full_index)

    spend_cols = [c for c, r in column_roles.items() if r is Role.SPEND and c in data.columns]
    kpi_cols = [c for c, r in column_roles.items() if r is Role.KPI and c in data.columns]
    control_cols = [c for c, r in column_roles.items() if r is Role.CONTROL and c in data.columns]

    # KPI / control gaps are reported, never invented.
    for col in kpi_cols:
        gaps = data.index[data[col].isna()]
        if len(gaps):
            report.add(
                "kpi_gaps", Severity.WARNING,
                f"KPI column {col!r} has {len(gaps)} missing week(s) inside the window",
                column=col, weeks=[ts.date().isoformat() for ts in gaps],
            )
    for col in control_cols:
        n_gaps = int(data[col].isna().sum())
        if not n_gaps:
            continue
        strategy = column_fills.get(col)
        if strategy is not None:
            from mmm_core.features import fill_missing

            data[col] = fill_missing(data[col], strategy)
            report.add(
                "control_filled", Severity.INFO,
                f"control column {col!r} had {n_gaps} missing week(s), filled with "
                f"strategy {strategy!r}",
                column=col, count=n_gaps, strategy=strategy,
            )
        else:
            report.add(
                "control_gaps", Severity.WARNING,
                f"control column {col!r} has {n_gaps} missing week(s) inside the window "
                f"(left as missing — set a `fill` strategy or clean it before modelling)",
                column=col, count=n_gaps,
            )

    # Window-first spend imputation: a missing spend week inside the window == no ads.
    if impute_spend_zero and spend_cols:
        filled = {c: int(data[c].isna().sum()) for c in spend_cols}
        data[spend_cols] = data[spend_cols].fillna(0.0)
        total_filled = sum(filled.values())
        if total_filled:
            report.add(
                "spend_imputed_zero", Severity.INFO,
                f"imputed {total_filled} missing spend week(s) with 0 inside the window",
                per_column=filled,
            )

    if event_dummies:
        column_roles.update(_apply_event_dummies(data, list(event_dummies), report))

    # Derived features come after event dummies so a feature may reference a dummy, and
    # after imputation so their inputs are already gap-free.
    if features:
        column_roles.update(_apply_features(data, list(features), report))

    _flag_near_identical(data, spend_cols, correlation_threshold, report)
    _flag_year_end_anomalies(data, kpi_cols, report)
    _flag_kpi_outliers(data, kpi_cols, report)
    _flag_predictor_outliers(data, spend_cols, control_cols, report)
    # Recompute control columns to include the just-added event dummies and features —
    # they cost parameters too, so the over-parameterization guard must count them.
    all_control_cols = [c for c, r in column_roles.items() if r is Role.CONTROL and c in data.columns]
    # An all-zero event dummy is already flagged as event_dummy_outside_window; keep it
    # out of the constant-column check so one mistake doesn't produce two warnings.
    dummy_names = {d.name for d in (event_dummies or [])}
    variance_check_cols = [c for c in all_control_cols if c not in dummy_names]
    _flag_degenerate_columns(data, spend_cols, kpi_cols, variance_check_cols, report)
    _flag_over_parameterization(len(data), spend_cols, kpi_cols, all_control_cols, report)
    # VIF over all predictors (channels + controls + event dummies + features), so group
    # collinearity that pairwise correlation misses is caught before a fit is spent.
    _flag_multicollinearity(data, spend_cols, all_control_cols, report)

    # Sanity checks on the output contract itself.
    assert data.index.is_unique, "master index has duplicate weeks"
    assert data.index.is_monotonic_increasing, "master index is not sorted"

    return BuildResult(
        data=data,
        window=(pd.Timestamp(window_start), pd.Timestamp(window_end)),
        report=report,
        column_roles=column_roles,
        sources=source_names,
    )


def build_master_datasets_by_region(
    sources_by_region: dict[str, list[tuple[SourceSpec, pd.DataFrame]]],
    *,
    correlation_threshold: float = _DEFAULT_CORR_THRESHOLD,
    impute_spend_zero: bool = True,
    event_dummies: list[EventDummySpec] | None = None,
    features: list[FeatureSpec] | None = None,
    source_transforms: dict[str, dict[str, list[TransformSpec]]] | None = None,
) -> tuple[dict[str, pd.DataFrame], QualityReport]:
    """Build one aligned master table per region, for :mod:`mmm_core.model.hierarchical`.

    Each region is a separate set of uploaded sources (the same recipe — same KPI/channel/
    control column names — applied to that region's own files), built independently via
    :func:`build_master_dataset` so each region's own per-source quality checks, name
    collisions and window-first imputation all run exactly as they would for a
    single-region project. The per-region results are then trimmed to the *shared*
    (intersection) weekly window across every region — :func:`mmm_core.model.hierarchical.
    build_hierarchical_model` requires every region to share the exact same weekly index —
    with a warning for any region whose own window had to be cut down to fit.

    Args:
        sources_by_region: region name -> that region's ``(SourceSpec, DataFrame)`` pairs,
            in the same shape :func:`build_master_dataset` takes for a single region.
        source_transforms: optional per-region, per-source raw-table transforms — keyed
            first by region, then by source name (i.e. ``source_transforms[region]`` is
            exactly what :func:`build_master_dataset` expects as its own
            ``source_transforms``).

    Returns:
        ``(region_frames, report)``. On a fatal error (a region with no window at all, or
        no overlap across regions) ``region_frames`` is empty and the error is on
        ``report`` — the same "report, never raise" convention as
        :func:`build_master_dataset`.
    """
    if not sources_by_region:
        raise ValueError("build_master_datasets_by_region requires at least one region")
    if len(sources_by_region) < 2:
        raise ValueError("a hierarchical model needs at least two regions")

    report = QualityReport()
    results: dict[str, BuildResult] = {}
    for region, sources in sources_by_region.items():
        result = build_master_dataset(
            sources,
            correlation_threshold=correlation_threshold,
            impute_spend_zero=impute_spend_zero,
            event_dummies=event_dummies,
            features=features,
            source_transforms=(source_transforms or {}).get(region),
        )
        for issue in result.report:
            # Re-tag with the region as `source` (dropping the original per-file source,
            # if any — it's still visible in the message text) so a combined report makes
            # it unambiguous which region an issue came from.
            report.add(
                issue.code, issue.severity, f"[{region}] {issue.message}",
                source=region, **issue.details,
            )
        results[region] = result

    if any(r.window is None for r in results.values()):
        report.add(
            "region_no_window", Severity.ERROR,
            "one or more regions has no analysis window on its own (see the per-region "
            "issues above); cannot build a hierarchical dataset",
        )
        return {}, report

    window_start = max(r.window[0] for r in results.values())
    window_end = min(r.window[1] for r in results.values())
    if window_start > window_end:
        report.add(
            "no_region_overlap", Severity.ERROR,
            "regions do not overlap in time; no common analysis window exists across all "
            "regions",
            window_start=str(window_start.date()), window_end=str(window_end.date()),
        )
        return {}, report

    shared_index = pd.date_range(window_start, window_end, freq="7D", name="week_start")
    region_frames: dict[str, pd.DataFrame] = {}
    for region, result in results.items():
        trimmed = result.data.reindex(shared_index)
        if len(trimmed) != len(result.data):
            report.add(
                "region_window_trimmed", Severity.WARNING,
                f"region {region!r}: trimmed from its own window "
                f"({result.window[0].date()}..{result.window[1].date()}, {len(result.data)} "
                f"weeks) to the window shared by every region "
                f"({window_start.date()}..{window_end.date()}, {len(trimmed)} weeks)",
                source=region,
            )
        region_frames[region] = trimmed

    return region_frames, report
