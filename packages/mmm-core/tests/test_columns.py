"""Deterministic column validation.

Each of these is a mistake the pre-refactor flow would have accepted: the AI proposed a
role from fifteen preview rows, `parseColumnMapping` checked only that the returned string
was a valid enum value, and the user confirmed by typing "1".
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from mmm_core import ColumnRole, validate_columns
from mmm_core.ingestion.columns import looks_like_identifier

N = 40


def _frame(**columns) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    base = {
        "week": pd.date_range("2024-01-01", periods=N, freq="7D").astype(str),
        "revenue": rng.normal(5_000, 400, N),
        "tv_spend": np.abs(rng.normal(800, 200, N)) + 50,
    }
    base.update(columns)
    return pd.DataFrame(base)


def _roles(**overrides) -> dict[str, str]:
    roles = {"week": "date", "revenue": "kpi", "tv_spend": "spend"}
    roles.update(overrides)
    return roles


def test_a_sound_assignment_passes():
    assert validate_columns(_frame(), _roles()).ok


# --- identifier detection -------------------------------------------------------------


def test_an_order_id_cannot_become_a_channel():
    """The worst case: a monotone counter correlates with any trend, so it absorbs real
    effect and comes out looking significant."""
    data = _frame(order_id=np.arange(10_000, 10_000 + N))
    result = validate_columns(data, _roles(order_id="spend"))
    assert not result.ok
    finding = result.for_column("order_id")[0]
    assert finding.code == "looks_like_identifier"
    assert finding.suggested_role is ColumnRole.IGNORE


def test_a_price_column_is_not_mistaken_for_an_identifier():
    # Nearly all values distinct, but not integers and not monotone.
    rng = np.random.default_rng(1)
    assert not looks_like_identifier(pd.Series(rng.normal(19.95, 2.0, N)))


def test_a_rising_revenue_column_is_not_mistaken_for_an_identifier():
    # Integers and trending upward, but it does go down sometimes — as real data does.
    rng = np.random.default_rng(2)
    values = np.cumsum(rng.integers(-50, 200, N)) + 10_000
    assert not looks_like_identifier(pd.Series(values))


def test_a_short_column_is_never_called_an_identifier():
    assert not looks_like_identifier(pd.Series([1, 2, 3]))


# --- type checks -----------------------------------------------------------------------


def test_a_text_column_cannot_be_a_control():
    data = _frame(campaign_name=["zomeractie"] * N)
    result = validate_columns(data, _roles(campaign_name="control"))
    assert [f.code for f in result.for_column("campaign_name")] == ["not_numeric"]


def test_a_date_column_that_does_not_parse_is_refused():
    data = _frame(periode=["week één"] * N)
    result = validate_columns(data, {"periode": "date", "revenue": "kpi", "tv_spend": "spend"})
    assert any(f.code == "date_does_not_parse" for f in result.blocking)


def test_a_column_that_is_not_in_the_file_is_reported_not_ignored():
    result = validate_columns(_frame(), _roles(ghost="spend"))
    assert any(f.code == "column_missing" for f in result.blocking)


# --- spend --------------------------------------------------------------------------------


def test_negative_spend_is_blocking_and_says_what_to_do():
    data = _frame(refunds=-np.abs(np.random.default_rng(3).normal(50, 10, N)))
    result = validate_columns(data, _roles(refunds="spend"))
    finding = result.for_column("refunds")[0]
    assert finding.code == "negative_spend"
    assert "0" in finding.message   # tells the user what to do about it


def test_an_all_zero_channel_is_blocking():
    data = _frame(radio=np.zeros(N))
    result = validate_columns(data, _roles(radio="spend"))
    assert any(f.code == "all_zero_channel" for f in result.blocking)


# --- kpi ------------------------------------------------------------------------------------


def test_a_constant_kpi_is_refused():
    data = _frame(revenue=np.full(N, 100.0))
    assert any(f.code == "kpi_barely_varies" for f in validate_columns(data, _roles()).blocking)


def test_a_kpi_that_is_never_positive_is_refused():
    data = _frame(revenue=np.linspace(-500, -100, N))
    assert any(f.code == "kpi_not_positive" for f in validate_columns(data, _roles()).blocking)


def test_a_kpi_with_a_few_negative_weeks_is_a_warning_not_a_block():
    """Returns are real. Blocking would send the user editing correct data."""
    values = np.random.default_rng(4).normal(5_000, 400, N)
    values[3] = -200.0
    result = validate_columns(_frame(revenue=values), _roles())
    assert result.ok
    assert any(f.code == "kpi_has_negatives" for f in result.warnings)


def test_a_constant_control_is_refused():
    data = _frame(price=np.full(N, 9.99))
    assert any(f.code == "constant_control" for f in validate_columns(data, _roles(price="control")).blocking)


# --- the assignment as a whole ---------------------------------------------------------------


def test_a_missing_date_column_is_reported():
    result = validate_columns(_frame(), {"revenue": "kpi", "tv_spend": "spend"})
    assert any(f.code == "no_date_column" for f in result.blocking)


def test_two_kpi_columns_are_reported():
    data = _frame(orders=np.arange(100, 100 + N) * 1.0)
    result = validate_columns(data, _roles(orders="kpi"))
    assert any(f.code == "multiple_kpi_columns" for f in result.blocking)


def test_no_channels_at_all_is_reported():
    result = validate_columns(_frame(), {"week": "date", "revenue": "kpi"})
    assert any(f.code == "no_channels" for f in result.blocking)


def test_ignored_columns_are_not_checked():
    """A free-text column the user excluded should not produce noise."""
    data = _frame(notes=["vrije tekst"] * N)
    result = validate_columns(data, _roles(notes="ignore"))
    assert result.ok
    assert result.for_column("notes") == []


def test_all_problems_are_reported_at_once():
    """One upload, one list — not a new error each time the user fixes something."""
    data = _frame(
        order_id=np.arange(1, N + 1),
        notes=["x"] * N,
        radio=np.zeros(N),
    )
    result = validate_columns(data, _roles(order_id="spend", notes="control", radio="spend"))
    assert {f.code for f in result.blocking} >= {
        "looks_like_identifier", "not_numeric", "all_zero_channel"
    }


def test_every_message_tells_the_user_what_to_do():
    data = _frame(order_id=np.arange(1, N + 1), notes=["x"] * N)
    result = validate_columns(data, _roles(order_id="spend", notes="control"))
    for finding in result.findings:
        assert len(finding.message) > 40
        assert finding.message.rstrip().endswith((".", "!"))


# --- campaign flags mistaken for channels ---------------------------------------------


def test_a_zero_one_campaign_flag_cannot_become_a_channel():
    """The MediaMarkt case: `tv_burst_campagne` is a calendar, not a budget. Modelled as
    spend its 'total spend' is a week count (42) and its ROAS comes out in the hundreds."""
    flag = np.zeros(N)
    flag[10:20] = 1.0
    data = _frame(tv_burst_campagne=flag)
    result = validate_columns(data, _roles(tv_burst_campagne="spend"))

    assert not result.ok
    finding = result.for_column("tv_burst_campagne")[0]
    assert finding.code == "binary_column_as_spend"
    assert finding.severity == "blocking"
    assert finding.suggested_role is ColumnRole.CONTROL


def test_the_same_flag_is_fine_as_a_control():
    flag = np.zeros(N)
    flag[10:20] = 1.0
    data = _frame(tv_burst_campagne=flag)
    assert validate_columns(data, _roles(tv_burst_campagne="control")).ok


def test_a_real_channel_that_happens_to_rest_at_zero_is_not_called_binary():
    """Flighted channels sit at 0 for most weeks — that must stay a legitimate channel."""
    flighted = np.zeros(N)
    flighted[::4] = 36_000.0
    data = _frame(radio_spend=flighted)
    result = validate_columns(data, _roles(radio_spend="spend"))
    assert not [f for f in result.for_column("radio_spend") if f.code == "binary_column_as_spend"]
