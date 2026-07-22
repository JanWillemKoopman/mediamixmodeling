"""Tests for the MMM-specific data-quality checks added to the ingestion pipeline:
currency/locale parsing, negative/degenerate columns, duplicate dates, the
over-parameterization guard and partial edge weeks."""

import numpy as np
import pandas as pd
import pytest

from mmm_core import ColumnSpec, Role, SourceSpec, build_master_dataset
from synthetic import daily_frame


def _spec(name, col, role, date_column=None, essential=True):
    return SourceSpec(
        name=name,
        columns=(ColumnSpec(col, role),),
        date_column=date_column,
        essential=essential,
    )


def _weekly_dates(start: str, weeks: int) -> pd.Series:
    return pd.Series(pd.date_range(start, periods=weeks, freq="7D"))


# --- currency / decimal-comma parsing -------------------------------------------

def test_dutch_currency_strings_are_parsed_not_nan():
    # "€ 1.234,56"-style values: plain to_numeric would coerce ALL of these to NaN,
    # after which spend imputation silently zeroes the channel.
    dates = _weekly_dates("2022-01-03", 12)
    values = [f"€ 1.2{i:02d},50" for i in range(12)]  # e.g. "€ 1.200,50" = 1200.50
    df = pd.DataFrame({"date": dates, "spend": values})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "currency_parsed" in result.report.codes()
    assert result.data["spend"].iloc[0] == pytest.approx(1200.50)
    # No week became NaN/0 through the failed-parse route.
    assert result.data["spend"].notna().all()
    assert (result.data["spend"] > 1000).all()


def test_english_thousand_separators_are_parsed():
    dates = _weekly_dates("2022-01-03", 12)
    df = pd.DataFrame({"date": dates, "spend": [f"{i + 1},234.56" for i in range(12)]})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "currency_parsed" in result.report.codes()
    assert result.data["spend"].iloc[0] == pytest.approx(1234.56)


def test_plain_numeric_columns_do_not_trigger_currency_parsing():
    df = daily_frame("2022-01-03", 14, 12.5, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "currency_parsed" not in result.report.codes()


def test_genuinely_textual_column_stays_reported_as_non_numeric():
    dates = _weekly_dates("2022-01-03", 8)
    df = pd.DataFrame({"date": dates, "spend": ["n.v.t."] * 8})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "currency_parsed" not in result.report.codes()
    assert "non_numeric_values" in result.report.codes()


# --- negative spend / degenerate columns ----------------------------------------

def test_negative_spend_is_flagged():
    dates = _weekly_dates("2022-01-03", 12)
    spend = np.full(12, 100.0)
    spend[5] = -40.0
    df = pd.DataFrame({"date": dates, "spend": spend})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "negative_spend" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "negative_spend")
    assert issue.details["count"] == 1


def test_all_zero_channel_is_flagged():
    dates = _weekly_dates("2022-01-03", 12)
    kpi = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1100, 12)})
    dead = pd.DataFrame({"date": dates, "spend": np.zeros(12)})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("dead", "spend", Role.SPEND, "date"), dead),
    ])
    assert "all_zero_channel" in result.report.codes()


def test_constant_control_is_flagged_as_zero_variance():
    dates = _weekly_dates("2022-01-03", 12)
    kpi = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1100, 12)})
    ctrl = pd.DataFrame({"date": dates, "price": np.full(12, 9.99)})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("p", "price", Role.CONTROL, "date"), ctrl),
    ])
    assert "zero_variance_column" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "zero_variance_column")
    assert issue.details["column"] == "price"


def test_varying_columns_are_not_flagged_degenerate():
    dates = _weekly_dates("2022-01-03", 12)
    kpi = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1100, 12)})
    spend = pd.DataFrame({"date": dates, "spend": np.linspace(50, 200, 12)})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
    ])
    for code in ("negative_spend", "all_zero_channel", "zero_variance_column"):
        assert code not in result.report.codes()


# --- duplicate dates ------------------------------------------------------------

def test_different_rows_on_same_date_are_flagged():
    # A total row next to a detail row for the same date: values silently sum.
    dates = list(_weekly_dates("2022-01-03", 10))
    df = pd.DataFrame({"date": dates + [dates[3]], "spend": [10.0] * 10 + [999.0]})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "duplicate_dates_aggregated" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "duplicate_dates_aggregated")
    assert issue.details["example_date"] == "2022-01-24"


def test_identical_duplicate_rows_do_not_trigger_duplicate_dates():
    # Fully identical rows are covered by the existing duplicate_rows warning.
    dates = list(_weekly_dates("2022-01-03", 10))
    df = pd.DataFrame({"date": dates + [dates[3]], "spend": [10.0] * 10 + [10.0]})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "duplicate_rows" in result.report.codes()
    assert "duplicate_dates_aggregated" not in result.report.codes()


def test_daily_data_does_not_trigger_duplicate_dates():
    df = daily_frame("2022-01-03", 28, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "duplicate_dates_aggregated" not in result.report.codes()


# --- over-parameterization guard ------------------------------------------------

def _many_channel_sources(weeks: int, n_channels: int):
    dates = _weekly_dates("2022-01-03", weeks)
    rng = np.random.default_rng(0)
    sources = [(
        _spec("rev", "revenue", Role.KPI, "date"),
        pd.DataFrame({"date": dates, "revenue": 1000 + rng.normal(0, 30, weeks)}),
    )]
    for c in range(n_channels):
        sources.append((
            _spec(f"ch{c}", f"spend_{c}", Role.SPEND, "date"),
            pd.DataFrame({"date": dates, f"spend_{c}": rng.uniform(10, 100, weeks)}),
        ))
    return sources


def test_too_few_weeks_per_channel_is_an_error():
    result = build_master_dataset(_many_channel_sources(weeks=10, n_channels=3))
    issue = next(i for i in result.report.issues if i.code == "too_many_parameters")
    assert issue.severity.value == "error"
    assert result.report.has_errors


def test_marginal_weeks_per_channel_is_a_warning():
    result = build_master_dataset(_many_channel_sources(weeks=20, n_channels=3))
    issue = next(i for i in result.report.issues if i.code == "too_many_parameters")
    assert issue.severity.value == "warning"


def test_ample_weeks_per_channel_is_clean():
    result = build_master_dataset(_many_channel_sources(weeks=52, n_channels=3))
    assert "too_many_parameters" not in result.report.codes()


def test_no_kpi_means_no_parameter_guard():
    # A spend-only structural merge can never reach a fit; the guard must stay silent.
    df = daily_frame("2022-01-03", 14, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "too_many_parameters" not in result.report.codes()


# --- partial edge weeks ---------------------------------------------------------

def test_partial_last_week_of_daily_source_is_flagged():
    # 6 full weeks starting Monday + 2 extra days: the last ISO week holds 2 of ~7 rows.
    df = daily_frame("2022-01-03", 44, 10.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])

    assert "partial_edge_week" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "partial_edge_week")
    assert issue.details["rows"] == 2


def test_complete_daily_weeks_are_not_flagged():
    df = daily_frame("2022-01-03", 42, 10.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "partial_edge_week" not in result.report.codes()


def test_weekly_source_is_not_flagged_partial():
    dates = _weekly_dates("2022-01-03", 12)
    df = pd.DataFrame({"date": dates, "spend": np.linspace(50, 200, 12)})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "partial_edge_week" not in result.report.codes()


# --- window explanation ---------------------------------------------------------

def _window_scenario():
    # revenue 2022-01-03..2022-03-28 (13 wk); spend starts 4 weeks later and ends 2
    # weeks earlier -> shared window is set by spend on both ends, revenue loses weeks.
    rev = pd.DataFrame({"date": _weekly_dates("2022-01-03", 13), "revenue": np.linspace(900, 1200, 13)})
    spend = pd.DataFrame({"date": _weekly_dates("2022-01-31", 7), "spend": np.linspace(50, 200, 7)})
    return build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), rev),
        (_spec("google", "spend", Role.SPEND, "date"), spend),
    ])


def test_window_boundary_names_the_pinning_source():
    result = _window_scenario()
    boundaries = [i for i in result.report.issues if i.code == "window_boundary"]
    assert {i.details["boundary"] for i in boundaries} == {"start", "end"}
    start_issue = next(i for i in boundaries if i.details["boundary"] == "start")
    assert "google" in start_issue.details["sources"]
    assert start_issue.details["date"] == "2022-01-31"


def test_source_window_trimmed_counts_dropped_weeks():
    result = _window_scenario()
    trimmed = next(i for i in result.report.issues if i.code == "source_window_trimmed")
    # revenue loses the 4 leading weeks + 2 trailing weeks it has beyond spend's span.
    assert trimmed.source == "rev"
    assert trimmed.details["dropped"] == 6
    assert trimmed.details["before"] == 4
    assert trimmed.details["after"] == 2


def test_fully_overlapping_sources_report_no_trimming():
    dates = _weekly_dates("2022-01-03", 12)
    rev = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1200, 12)})
    spend = pd.DataFrame({"date": dates, "spend": np.linspace(50, 200, 12)})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), rev),
        (_spec("g", "spend", Role.SPEND, "date"), spend),
    ])
    assert "source_window_trimmed" not in result.report.codes()


# --- coarse cadence (monthly data) ----------------------------------------------

def test_monthly_source_is_flagged_coarse_cadence():
    months = pd.Series(pd.date_range("2022-01-01", periods=12, freq="MS"))
    df = pd.DataFrame({"date": months, "spend": np.linspace(100, 300, 12)})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "coarse_cadence" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "coarse_cadence")
    assert issue.details["median_gap_days"] >= 24


def test_weekly_source_is_not_flagged_coarse_cadence():
    df = pd.DataFrame({"date": _weekly_dates("2022-01-03", 12), "spend": np.linspace(50, 200, 12)})
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "coarse_cadence" not in result.report.codes()


def test_daily_source_is_not_flagged_coarse_cadence():
    df = daily_frame("2022-01-03", 40, 1.0, date_col="date", value_col="spend")
    result = build_master_dataset([(_spec("g", "spend", Role.SPEND, "date"), df)])
    assert "coarse_cadence" not in result.report.codes()


# --- predictor (spend/control) outliers -----------------------------------------

def test_spend_outlier_week_is_flagged_as_info():
    dates = _weekly_dates("2022-01-03", 20)
    rng = np.random.default_rng(3)
    spend = 100.0 + rng.normal(0, 8, 20)  # mild week-to-week variation, so local MAD > 0
    spend[10] = 5000.0
    kpi = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1100, 20)})
    df = pd.DataFrame({"date": dates, "spend": spend})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), df),
    ])
    issue = next(i for i in result.report.issues if i.code == "predictor_outlier_weeks")
    assert issue.severity.value == "info"
    assert issue.details["role"] == "spend"


def test_smooth_spend_has_no_predictor_outliers():
    dates = _weekly_dates("2022-01-03", 20)
    kpi = pd.DataFrame({"date": dates, "revenue": np.linspace(900, 1100, 20)})
    df = pd.DataFrame({"date": dates, "spend": np.linspace(50, 200, 20)})
    result = build_master_dataset([
        (_spec("rev", "revenue", Role.KPI, "date"), kpi),
        (_spec("g", "spend", Role.SPEND, "date"), df),
    ])
    assert "predictor_outlier_weeks" not in result.report.codes()


# --- multicollinearity (VIF) ----------------------------------------------------

def test_linearly_dependent_channels_are_flagged_by_vif():
    dates = _weekly_dates("2022-01-03", 40)
    rng = np.random.default_rng(1)
    a = rng.uniform(10, 100, 40)
    b = rng.uniform(10, 100, 40)
    c = a + b + rng.normal(0, 0.01, 40)  # c ≈ a + b : high VIF, but pairwise r modest
    kpi = pd.DataFrame({"date": dates, "revenue": 1000 + rng.normal(0, 20, 40)})
    frames = [(_spec("rev", "revenue", Role.KPI, "date"), kpi)]
    for name, vals in (("a", a), (("b", b)), ("c", c)):
        frames.append((_spec(name, f"spend_{name}", Role.SPEND, "date"),
                       pd.DataFrame({"date": dates, f"spend_{name}": vals})))
    result = build_master_dataset(frames)
    assert "multicollinearity" in result.report.codes()
    issue = next(i for i in result.report.issues if i.code == "multicollinearity")
    assert issue.details["max_vif"] >= 10


def test_independent_channels_have_no_vif_flag():
    dates = _weekly_dates("2022-01-03", 40)
    rng = np.random.default_rng(2)
    kpi = pd.DataFrame({"date": dates, "revenue": 1000 + rng.normal(0, 20, 40)})
    frames = [(_spec("rev", "revenue", Role.KPI, "date"), kpi)]
    for name in ("a", "b", "c"):
        frames.append((_spec(name, f"spend_{name}", Role.SPEND, "date"),
                       pd.DataFrame({"date": dates, f"spend_{name}": rng.uniform(10, 100, 40)})))
    result = build_master_dataset(frames)
    assert "multicollinearity" not in result.report.codes()
