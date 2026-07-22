import numpy as np
import pandas as pd
import pytest

from mmm_core import Role, SourceSpec, build_master_dataset
from mmm_core.ingestion import ColumnSpec
from mmm_core.ingestion.quality import QualityReport
from mmm_core.ingestion.transforms import TransformSpec, apply_transform, apply_transforms


def _df():
    return pd.DataFrame(
        {
            "Datum": ["01/02/2024", "08/02/2024", "15/02/2024"],  # day-first
            "omzet_cent": [10000, 12000, 11000],
            "kanaal": ["google", "google", "meta"],
            "spend": [100, 120, 90],
        }
    )


def test_spec_rejects_unknown_op():
    with pytest.raises(ValueError):
        TransformSpec(op="nope")


def test_rename():
    out = apply_transform(TransformSpec("rename", {"from": "Datum", "to": "week"}), _df())
    assert "week" in out.columns and "Datum" not in out.columns


def test_scale_converts_units():
    out = apply_transform(TransformSpec("scale", {"column": "omzet_cent", "factor": 0.01}), _df())
    assert out["omzet_cent"].tolist() == [100.0, 120.0, 110.0]


def test_filter_rows_numeric_and_category():
    out = apply_transform(TransformSpec("filter_rows", {"column": "spend", "compare": "ge", "value": 100}), _df())
    assert len(out) == 2
    out2 = apply_transform(
        TransformSpec("filter_rows", {"column": "kanaal", "compare": "eq", "value": "meta"}), _df()
    )
    assert out2["kanaal"].tolist() == ["meta"]


def test_drop_duplicates():
    df = pd.concat([_df(), _df().head(1)], ignore_index=True)
    out = apply_transform(TransformSpec("drop_duplicates", {}), df)
    assert len(out) == 3


def test_combine_sum_and_concat():
    df = _df().assign(extra=[1, 2, 3])
    s = apply_transform(TransformSpec("combine", {"columns": ["spend", "extra"], "into": "tot", "how": "sum"}), df)
    assert s["tot"].tolist() == [101, 122, 93]
    c = apply_transform(
        TransformSpec("combine", {"columns": ["kanaal", "kanaal"], "into": "k2", "how": "concat", "sep": "-"}), df
    )
    assert c["k2"].iloc[0] == "google-google"


def test_split():
    df = pd.DataFrame({"pair": ["a_1", "b_2"]})
    out = apply_transform(TransformSpec("split", {"column": "pair", "into_columns": ["letter", "num"], "sep": "_"}), df)
    assert out["letter"].tolist() == ["a", "b"]
    assert out["num"].tolist() == ["1", "2"]


def test_recode_with_default():
    out = apply_transform(
        TransformSpec(
            "recode",
            {"column": "kanaal", "mapping": [{"from": "google", "to": "Google Ads"}], "default": "Overig"},
        ),
        _df(),
    )
    assert out["kanaal"].tolist() == ["Google Ads", "Google Ads", "Overig"]


def test_parse_date_dayfirst():
    out = apply_transform(TransformSpec("parse_date", {"column": "Datum", "dayfirst": True}), _df())
    assert out["Datum"].iloc[0] == pd.Timestamp("2024-02-01")


def test_parse_date_explicit_format():
    out = apply_transform(TransformSpec("parse_date", {"column": "Datum", "format": "%d/%m/%Y"}), _df())
    assert out["Datum"].iloc[2] == pd.Timestamp("2024-02-15")


def test_pivot_long_to_wide():
    df = pd.DataFrame(
        {
            "week": ["2024-01-01", "2024-01-01", "2024-01-08"],
            "channel": ["google", "meta", "google"],
            "spend": [10, 20, 15],
        }
    )
    out = apply_transform(
        TransformSpec("pivot", {"index": "week", "columns": "channel", "values": "spend", "aggfunc": "sum"}), df
    )
    assert "google" in out.columns and "meta" in out.columns
    assert set(out["week"]) == {"2024-01-01", "2024-01-08"}


def test_apply_transforms_reports_error_and_skips():
    report = QualityReport()
    out = apply_transforms(
        _df(), [TransformSpec("rename", {"from": "nope", "to": "x"})], report, "src"
    )
    assert "nope" not in out.columns
    assert any(i.code == "transform_error" for i in report)


# --- integration: a messy long-format file cleaned into the master ----------------

def test_pivot_then_merge_produces_channel_columns():
    long = pd.DataFrame(
        {
            "day": pd.to_datetime(["2024-01-01", "2024-01-01", "2024-01-08", "2024-01-08"]),
            "channel": ["google", "meta", "google", "meta"],
            "spend": [10.0, 20.0, 15.0, 25.0],
        }
    )
    rev = pd.DataFrame({"day": pd.to_datetime(["2024-01-01", "2024-01-08"]), "revenue": [100.0, 110.0]})

    spend_spec = SourceSpec(
        name="spend",
        columns=(ColumnSpec("google", Role.SPEND), ColumnSpec("meta", Role.SPEND)),
        date_column="day",
    )
    rev_spec = SourceSpec(name="rev", columns=(ColumnSpec("revenue", Role.KPI),), date_column="day")

    result = build_master_dataset(
        [(spend_spec, long), (rev_spec, rev)],
        source_transforms={
            "spend": [TransformSpec("pivot", {"index": "day", "columns": "channel", "values": "spend"})],
        },
    )
    assert result.window is not None
    assert result.column_roles["google"] is Role.SPEND
    assert result.column_roles["meta"] is Role.SPEND
    assert "revenue" in result.data.columns
