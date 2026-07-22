import pandas as pd
import pytest

from mmm_core.ingestion.events import EventDummySpec, build_event_dummy


def test_week_starts_uses_monday_iso_week_convention():
    spec = EventDummySpec(name="d", weeks=((2025, 45),))
    # ISO week 45 of 2025 starts Monday 2025-11-03.
    assert spec.week_starts() == [pd.Timestamp("2025-11-03")]


def test_build_event_dummy_is_one_only_on_declared_weeks():
    index = pd.date_range("2025-10-27", periods=4, freq="7D", name="week_start")
    spec = EventDummySpec(name="dummy_2025w45", weeks=((2025, 45),))
    dummy = build_event_dummy(index, spec)
    assert dummy.tolist() == [0.0, 1.0, 0.0, 0.0]
    assert dummy.name == "dummy_2025w45"


def test_build_event_dummy_supports_multiple_weeks():
    index = pd.date_range("2025-10-27", periods=4, freq="7D", name="week_start")
    spec = EventDummySpec(name="d", weeks=((2025, 44), (2025, 46)))
    dummy = build_event_dummy(index, spec)
    assert dummy.tolist() == [1.0, 0.0, 1.0, 0.0]


def test_empty_weeks_rejected():
    with pytest.raises(ValueError):
        EventDummySpec(name="d", weeks=())
