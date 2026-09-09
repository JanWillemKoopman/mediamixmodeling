import numpy as np
import pandas as pd
import pytest

from mmm_core import (
    ColumnSpec,
    EventDummySpec,
    Role,
    Severity,
    SourceSpec,
    build_master_dataset,
)
from synthetic import daily_frame, three_source_scenario


def _spec(name, col, role, date_column=None, essential=True, output_name=None):
    return SourceSpec(
        name=name,
        columns=(ColumnSpec(col, role, output_name=output_name),),
        date_column=date_column,
        essential=essential,
    )


# --- aggregation ----------------------------------------------------------------

def test_iso_week_aggregation_sums_spend_per_week():
    # 14 daily rows of 1.0 spend -> two ISO weeks of 7.0 each.
    df = daily_frame("2022-01-03", 14, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert list(result.data.index) == [pd.Timestamp("2022-01-03"), pd.Timestamp("2022-01-10")]
    assert result.data["spend"].tolist() == [7.0, 7.0]
    assert not result.report.has_errors


def test_control_column_is_averaged_not_summed():
    df = daily_frame("2022-01-03", 7, 10.0, date_col="date", value_col="price")
    result = build_master_dataset([(_spec("p", "price", Role.CONTROL, "date"), df)])
    assert result.data["price"].iloc[0] == pytest.approx(10.0)


# --- overlap window -------------------------------------------------------------

def test_window_is_intersection_of_essential_sources():
    s = three_source_scenario()
    sources = [
        (_spec("revenue", "revenue", Role.KPI, "week"), s["revenue"]),
        (_spec("google", "google_spend", Role.SPEND, "date"), s["google"]),
        (_spec("facebook", "facebook_spend", Role.SPEND, "datum"), s["facebook"]),
        # price spans wider but is non-essential -> must not widen the window.
        (_spec("price", "price", Role.CONTROL, "day", essential=False), s["price"]),
    ]
    result = build_master_dataset(sources)

    # facebook starts on Monday 2022-02-07 -> window starts there, not earlier.
    assert result.window is not None
    assert result.window[0] == pd.Timestamp("2022-02-07")
    assert result.data.index.min() == pd.Timestamp("2022-02-07")
    # every essential channel present, price carried along inside the window.
    assert set(["revenue", "google_spend", "facebook_spend", "price"]).issubset(result.data.columns)


def test_no_overlap_reports_error_and_null_window():
    a = daily_frame("2022-01-03", 7, 1.0, date_col="date", value_col="a")
    b = daily_frame("2022-06-06", 7, 1.0, date_col="date", value_col="b")
    result = build_master_dataset([
        (_spec("a", "a", Role.SPEND, "date"), a),
        (_spec("b", "b", Role.KPI, "date"), b),
    ])
    assert result.window is None
    assert "no_overlap" in result.report.codes()
    assert result.report.has_errors


# --- window-first imputation ----------------------------------------------------

def test_missing_spend_week_inside_window_imputed_zero():
    # KPI covers the whole range; google spend has a one-week hole inside the window.
    kpi = daily_frame("2022-01-03", 28, 1000.0, date_col="date", value_col="revenue")
    google = daily_frame("2022-01-03", 28, 50.0, date_col="date", value_col="spend")
    # drop the week of 2022-01-17 from spend entirely
    google = google[~google["date"].between("2022-01-17", "2022-01-23")]

    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), google),
    ])
    assert result.data.loc[pd.Timestamp("2022-01-17"), "spend"] == 0.0
    assert result.data["spend"].isna().sum() == 0
    assert "spend_imputed_zero" in result.report.codes()


def test_spend_not_invented_before_channel_existed():
    # Window is driven by KPI+google (full); facebook starts later. The pre-facebook
    # weeks fall OUTSIDE facebook's own span but INSIDE the window, so they get imputed
    # 0 — but crucially the window itself is never stretched before the essential start.
    kpi = daily_frame("2022-01-03", 56, 1000.0, date_col="date", value_col="revenue")
    google = daily_frame("2022-01-03", 56, 50.0, date_col="date", value_col="g_spend")
    fb = daily_frame("2022-01-31", 28, 30.0, date_col="date", value_col="fb_spend")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("google", "g_spend", Role.SPEND, "date"), google),
        (_spec("facebook", "fb_spend", Role.SPEND, "date"), fb),
    ])
    # window start is the common essential start = 2022-01-31 (facebook is essential).
    assert result.window[0] == pd.Timestamp("2022-01-31")
    assert result.data.index.min() == pd.Timestamp("2022-01-31")


# --- gaps are warned, never invented -------------------------------------------

def test_kpi_gap_is_warned_and_left_missing():
    kpi = daily_frame("2022-01-03", 28, 1000.0, date_col="date", value_col="revenue")
    kpi = kpi[~kpi["date"].between("2022-01-17", "2022-01-23")]  # remove a KPI week
    google = daily_frame("2022-01-03", 28, 50.0, date_col="date", value_col="spend")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), google),
    ])
    assert pd.isna(result.data.loc[pd.Timestamp("2022-01-17"), "revenue"])
    assert "kpi_gaps" in result.report.codes()


# --- cross-source checks --------------------------------------------------------

def test_near_identical_channels_are_flagged():
    rng = np.random.default_rng(1)
    base = 100 + rng.normal(0, 20, 84)
    kpi = daily_frame("2022-01-03", 84, 1000.0, date_col="date", value_col="revenue")
    g = daily_frame("2022-01-03", 84, base, date_col="date", value_col="g")
    fb = daily_frame("2022-01-03", 84, base + rng.normal(0, 0.01, 84), date_col="date", value_col="fb")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("google", "g", Role.SPEND, "date"), g),
        (_spec("facebook", "fb", Role.SPEND, "date"), fb),
    ])
    assert "near_identical_channels" in result.report.codes()


def test_column_name_collision_is_prefixed():
    kpi = daily_frame("2022-01-03", 28, 1000.0, date_col="date", value_col="revenue")
    g = daily_frame("2022-01-03", 28, 50.0, date_col="date", value_col="spend")
    fb = daily_frame("2022-01-03", 28, 30.0, date_col="date", value_col="spend")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("google", "spend", Role.SPEND, "date"), g),
        (_spec("facebook", "spend", Role.SPEND, "date"), fb),
    ])
    assert "google_spend" in result.data.columns
    assert "facebook_spend" in result.data.columns
    assert "column_name_collision" in result.report.codes()
    assert result.column_roles["google_spend"] is Role.SPEND


def test_year_end_anomaly_is_flagged():
    kpi = daily_frame("2022-06-06", 365, 1000.0, date_col="date", value_col="revenue")
    # inject a huge spike in the turn-of-year week (2022-12-26 .. 2023-01-01)
    mask = kpi["date"].between("2022-12-26", "2023-01-01")
    kpi.loc[mask, "revenue"] = 100000.0
    spend = daily_frame("2022-06-06", 365, 50.0, date_col="date", value_col="spend")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
    ])
    assert "year_end_anomaly" in result.report.codes()


def test_kpi_outlier_week_is_flagged_on_a_trending_series():
    # A multi-year, upward-trending weekly KPI (mirrors a real regime-shifting KPI) with
    # one mid-year one-week spike. The turn-of-year check must NOT catch this (the spike
    # isn't near year-end); the new local-outlier check must name the exact week.
    n_days = 156 * 7
    kpi = daily_frame("2022-01-03", n_days, 1000.0, date_col="date", value_col="revenue")
    weeks = pd.date_range("2022-01-03", periods=156, freq="7D")
    trend = np.linspace(550.0, 950.0, 156)
    for i, week_start in enumerate(weeks):
        mask = kpi["date"].between(week_start, week_start + pd.Timedelta(days=6))
        kpi.loc[mask, "revenue"] = trend[i] / 7.0  # daily rows sum to the weekly trend value
    spike_week = weeks[100]
    spike_mask = kpi["date"].between(spike_week, spike_week + pd.Timedelta(days=6))
    kpi.loc[spike_mask, "revenue"] = (trend[100] + 400.0) / 7.0

    spend = daily_frame("2022-01-03", n_days, 50.0, date_col="date", value_col="spend")
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
    ])
    assert "kpi_outlier_weeks" in result.report.codes()
    outlier_issue = next(i for i in result.report.issues if i.code == "kpi_outlier_weeks")
    assert spike_week.date().isoformat() in outlier_issue.details["weeks"]
    assert "year_end_anomaly" not in result.report.codes()


# --- misc contracts -------------------------------------------------------------

def test_date_column_autodetected_when_not_specified():
    df = daily_frame("2022-01-03", 14, 1.0, date_col="order_date", value_col="spend")
    df["note"] = "x"
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, date_column=None), df)])
    assert result.data["spend"].sum() == pytest.approx(14.0)
    assert "date_column_detected" in result.report.codes()


def test_output_is_sorted_gap_free_and_unique():
    s = three_source_scenario()
    result = build_master_dataset([
        (_spec("revenue", "revenue", Role.KPI, "week"), s["revenue"]),
        (_spec("google", "google_spend", Role.SPEND, "date"), s["google"]),
        (_spec("facebook", "facebook_spend", Role.SPEND, "datum"), s["facebook"]),
    ])
    idx = result.data.index
    assert idx.is_monotonic_increasing and idx.is_unique
    deltas = idx.to_series().diff().dropna().dt.days.unique()
    assert list(deltas) == [7]  # perfectly weekly, no gaps


def test_empty_sources_raises():
    with pytest.raises(ValueError):
        build_master_dataset([])


# --- event dummies ---------------------------------------------------------------

def test_event_dummy_marks_only_the_specified_week():
    # 14 daily rows of spend from Monday 2022-01-03 -> ISO weeks (2022, 1) and (2022, 2).
    df = daily_frame("2022-01-03", 14, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset(
        [(_spec("g", "spend", Role.SPEND, "date"), df)],
        event_dummies=[EventDummySpec(name="dummy_w1", weeks=((2022, 1),))],
    )
    assert result.data["dummy_w1"].tolist() == [1.0, 0.0]
    assert result.column_roles["dummy_w1"] is Role.CONTROL
    assert "event_dummy_outside_window" not in result.report.codes()


def test_event_dummy_outside_window_is_flagged_and_all_zero():
    df = daily_frame("2022-01-03", 14, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset(
        [(_spec("g", "spend", Role.SPEND, "date"), df)],
        event_dummies=[EventDummySpec(name="dummy_far", weeks=((2019, 1),))],
    )
    assert result.data["dummy_far"].tolist() == [0.0, 0.0]
    assert "event_dummy_outside_window" in result.report.codes()


def test_event_dummy_name_collision_is_an_error():
    df = daily_frame("2022-01-03", 14, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset(
        [(_spec("g", "spend", Role.SPEND, "date"), df)],
        event_dummies=[EventDummySpec(name="spend", weeks=((2022, 1),))],
    )
    assert "event_dummy_name_collision" in result.report.codes()
    assert result.report.has_errors


# --- control fill strategy -------------------------------------------------------

def test_control_gap_left_as_nan_by_default_and_warned():
    # revenue + spend span the window; a non-essential control has an interior gap.
    kpi = daily_frame("2022-01-03", 84, 1000.0, date_col="date", value_col="revenue")
    spend = daily_frame("2022-01-03", 84, 50.0, date_col="date", value_col="spend")
    price = daily_frame("2022-01-03", 84, 9.99, date_col="date", value_col="price")
    # drop the second week of price entirely -> a gap inside the window.
    price = price[~price["date"].between("2022-01-10", "2022-01-16")]
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
        (_spec("p", "price", Role.CONTROL, "date", essential=False), price),
    ])
    assert "control_gaps" in result.report.codes()
    assert result.data["price"].isna().any()


def test_control_gap_filled_when_strategy_set():
    kpi = daily_frame("2022-01-03", 84, 1000.0, date_col="date", value_col="revenue")
    spend = daily_frame("2022-01-03", 84, 50.0, date_col="date", value_col="spend")
    price = daily_frame("2022-01-03", 84, 9.99, date_col="date", value_col="price")
    price = price[~price["date"].between("2022-01-10", "2022-01-16")]
    price_spec = SourceSpec(
        name="p",
        columns=(ColumnSpec("price", Role.CONTROL, fill="ffill"),),
        date_column="date",
        essential=False,
    )
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
        (price_spec, price),
    ])
    assert "control_filled" in result.report.codes()
    assert not result.data["price"].isna().any()


def test_fill_on_non_control_column_rejected_by_spec():
    with pytest.raises(ValueError):
        ColumnSpec("spend", Role.SPEND, fill="zero")
