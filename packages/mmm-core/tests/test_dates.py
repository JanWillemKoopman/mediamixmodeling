import pandas as pd
import pytest

from mmm_core.ingestion.dates import detect_date_column, to_week_start


def test_to_week_start_maps_every_day_to_its_monday():
    # 2022-01-05 is a Wednesday; its ISO week starts Monday 2022-01-03.
    days = pd.Series(pd.to_datetime(["2022-01-03", "2022-01-05", "2022-01-09"]))
    weeks = to_week_start(days)
    assert (weeks == pd.Timestamp("2022-01-03")).all()


def test_to_week_start_handles_year_boundary():
    # 2023-01-01 (Sunday) belongs to the ISO week starting Monday 2022-12-26.
    day = pd.Series(pd.to_datetime(["2023-01-01"]))
    assert to_week_start(day).iloc[0] == pd.Timestamp("2022-12-26")


def test_detect_prefers_hinted_parseable_column():
    df = pd.DataFrame({
        "id": [1, 2, 3],
        "order_date": ["2022-01-03", "2022-01-10", "2022-01-17"],
        "amount": [10.0, 20.0, 30.0],
    })
    assert detect_date_column(df) == "order_date"


def test_detect_ignores_small_integer_id_column():
    # A bare integer id column must NOT be mistaken for a date (ns-since-epoch trap).
    df = pd.DataFrame({"week_no": [1, 2, 3], "spend": [10, 20, 30]})
    with pytest.raises(ValueError):
        detect_date_column(df)


def test_detect_accepts_yyyymmdd_integer_dates():
    df = pd.DataFrame({"dt": [20220103, 20220110, 20220117], "spend": [1, 2, 3]})
    assert detect_date_column(df) == "dt"


def test_explicit_missing_column_raises_keyerror():
    df = pd.DataFrame({"date": ["2022-01-03"], "x": [1]})
    with pytest.raises(KeyError):
        detect_date_column(df, explicit="nope")


def test_explicit_unparseable_column_raises_valueerror():
    df = pd.DataFrame({"label": ["a", "b", "c"], "date": ["2022-01-03", "2022-01-10", "2022-01-17"]})
    with pytest.raises(ValueError):
        detect_date_column(df, explicit="label")
