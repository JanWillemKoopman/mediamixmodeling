import numpy as np
import pandas as pd
import pytest

from mmm_core import Role, SourceSpec, build_master_dataset
from mmm_core.ingestion import ColumnSpec
from mmm_core.ingestion.feature_engineering import FeatureSpec, build_feature


def _master() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=10, freq="7D", name="week_start")
    return pd.DataFrame(
        {
            "revenue": np.arange(10, 20, dtype=float),
            "google": np.arange(1, 11, dtype=float),
            "meta": np.arange(2, 12, dtype=float),
            "price": np.linspace(5.0, 6.0, 10),
        },
        index=idx,
    )


def test_spec_rejects_unknown_op():
    with pytest.raises(ValueError):
        FeatureSpec(name="x", op="nope", inputs=("google",))


def test_spec_rejects_wrong_arity():
    with pytest.raises(ValueError):
        FeatureSpec(name="x", op="lag", inputs=("a", "b"))
    with pytest.raises(ValueError):
        FeatureSpec(name="x", op="ratio", inputs=("a",))
    with pytest.raises(ValueError):
        FeatureSpec(name="x", op="product", inputs=("a",))


def test_lag_shifts_and_fills_leading_with_zero():
    s = build_feature(FeatureSpec("google_lag1", "lag", ("google",), {"weeks": 1}), _master())
    assert s.iloc[0] == 0.0
    assert s.iloc[1] == 1.0  # last week's google (which started at 1)
    assert not s.isna().any()


def test_rolling_mean_and_sum():
    m = _master()
    mean = build_feature(FeatureSpec("g_ma3", "rolling_mean", ("google",), {"window": 3}), m)
    assert mean.iloc[2] == pytest.approx((1 + 2 + 3) / 3)
    total = build_feature(FeatureSpec("g_rs3", "rolling_sum", ("google",), {"window": 3}), m)
    assert total.iloc[2] == pytest.approx(6.0)


def test_ratio_is_safe_on_zero_denominator():
    m = _master()
    m.loc[m.index[0], "meta"] = 0.0
    s = build_feature(FeatureSpec("share", "ratio", ("google", "meta")), m)
    assert s.iloc[0] == 0.0  # divide-by-zero -> 0, not inf/NaN
    assert np.isfinite(s.to_numpy()).all()


def test_product_and_sum_combine_columns():
    m = _master()
    prod = build_feature(FeatureSpec("inter", "product", ("google", "meta")), m)
    assert prod.iloc[0] == pytest.approx(1.0 * 2.0)
    total = build_feature(FeatureSpec("tot", "sum", ("google", "meta")), m)
    assert total.iloc[0] == pytest.approx(1.0 + 2.0)


def test_log1p_handles_negatives_without_raising():
    m = _master()
    m.loc[m.index[0], "price"] = -3.0
    s = build_feature(FeatureSpec("logp", "log1p", ("price",)), m)
    assert np.isfinite(s.to_numpy()).all()
    assert s.iloc[0] < 0  # sign preserved


def test_recurring_week_dummy_flags_iso_weeks():
    m = _master()
    s = build_feature(
        FeatureSpec("blackfriday", "recurring_week_dummy", (), {"iso_weeks": [1]}), m
    )
    # 2024-01-01 is ISO week 1 -> first row is flagged.
    assert s.iloc[0] == 1.0
    assert set(np.unique(s.to_numpy())) <= {0.0, 1.0}


def test_missing_param_raises():
    with pytest.raises(ValueError):
        build_feature(FeatureSpec("g", "lag", ("google",), {"weeks": None}), _master())


def test_missing_input_column_raises():
    with pytest.raises(ValueError):
        build_feature(FeatureSpec("g", "lag", ("nope",), {"weeks": 1}), _master())


# --- integration through build_master_dataset -------------------------------------

def _sources():
    idx = pd.date_range("2024-01-01", periods=8, freq="7D")
    rev = pd.DataFrame({"week": idx, "revenue": np.arange(100, 108, dtype=float)})
    spend = pd.DataFrame(
        {"week": idx, "google": np.arange(1, 9, dtype=float), "meta": np.arange(2, 10, dtype=float)}
    )
    return [
        (SourceSpec(name="rev", columns=(ColumnSpec("revenue", Role.KPI),), date_column="week"), rev),
        (
            SourceSpec(
                name="spend",
                columns=(ColumnSpec("google", Role.SPEND), ColumnSpec("meta", Role.SPEND)),
                date_column="week",
            ),
            spend,
        ),
    ]


def test_feature_becomes_a_control_column_in_the_master():
    features = [
        FeatureSpec("total_spend", "sum", ("google", "meta")),
        FeatureSpec("google_share", "ratio", ("google", "total_spend")),  # builds on the previous
    ]
    result = build_master_dataset(_sources(), features=features)
    assert "total_spend" in result.data.columns
    assert "google_share" in result.data.columns
    assert result.column_roles["total_spend"] is Role.CONTROL
    assert result.column_roles["google_share"] is Role.CONTROL
    assert not result.data[["total_spend", "google_share"]].isna().any().any()


def test_feature_with_unknown_input_is_reported_not_raised():
    features = [FeatureSpec("bad", "lag", ("does_not_exist",), {"weeks": 1})]
    result = build_master_dataset(_sources(), features=features)
    assert "bad" not in result.data.columns
    assert any(i.code == "feature_error" for i in result.report)


def test_feature_name_collision_is_reported():
    features = [FeatureSpec("google", "lag", ("google",), {"weeks": 1})]
    result = build_master_dataset(_sources(), features=features)
    assert any(i.code == "feature_name_collision" for i in result.report)
