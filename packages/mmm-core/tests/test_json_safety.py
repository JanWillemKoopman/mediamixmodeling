"""Every number leaving a fit must survive the trip to Postgres.

This is a regression suite for a defect that silently destroyed completed fits. Two
routine situations produced a ``NaN`` in the result summary:

* one KPI week with a value of exactly 0 (entirely normal for a leads or orders KPI) made
  ``np.mean`` over the percentage errors return ``NaN`` for the whole MAPE, and
* a channel with no spend in the window got ``roas = contribution * np.nan`` by
  construction.

``json.dumps`` then emitted a bare ``NaN`` literal, which is not valid JSON. PostgREST
rejected the insert, ``save_model_run`` raised, and the worker's outer handler marked the
job failed — throwing away a fit that had already finished sampling, and showing the user
a cryptic error about a job that had in fact worked.

These tests exercise the serialisation boundary directly, with no PyMC, so they run in the
fast suite where a regression will be noticed immediately.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from mmm_core.model.fit import (
    ChannelResult,
    Diagnostics,
    FitSummary,
    Interval,
    _safe_mape,
    _to_plain,
)


def _iv(v: float = 1.0) -> Interval:
    return Interval(v * 0.9, v, v * 1.1)


def _diagnostics(**kw) -> Diagnostics:
    defaults = dict(
        max_r_hat=1.0,
        min_ess_bulk=800.0,
        min_ess_tail=750.0,
        n_divergences=0,
        min_e_bfmi=0.9,
        n_max_treedepth=0,
        r2=0.8,
        mape=0.1,
        interval_coverage_94=0.94,
        interval_coverage_80=0.80,
        interval_coverage_50=0.51,
        residual_autocorrelation=0.05,
        decomposition_ok=True,
    )
    defaults.update(kw)
    return Diagnostics(**defaults)


# --- the serialisation boundary ----------------------------------------------------


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_floats_become_null(bad):
    assert _to_plain({"x": bad}) == {"x": None}
    assert _to_plain([bad]) == [None]
    assert _to_plain({"a": {"b": [bad, 1.0]}}) == {"a": {"b": [None, 1.0]}}


@pytest.mark.parametrize("bad", [np.float64("nan"), np.float64("inf")])
def test_non_finite_numpy_floats_become_null(bad):
    assert _to_plain({"x": bad}) == {"x": None}


def test_finite_values_pass_through_unchanged():
    payload = {"a": 1.5, "b": [0.0, -2.25], "c": np.int64(7), "d": "text", "e": None}
    assert _to_plain(payload) == {"a": 1.5, "b": [0.0, -2.25], "c": 7, "d": "text", "e": None}


def _summary(**kw) -> FitSummary:
    defaults = dict(
        kpi="revenue",
        n_weeks=52,
        window=("2024-01-01", "2024-12-23"),
        baseline_contribution=_iv(1000.0),
        channels=[],
        diagnostics=_diagnostics(),
        draws=1000,
        chains=4,
    )
    defaults.update(kw)
    return FitSummary(**defaults)


def test_summary_with_a_nan_mape_still_serialises():
    """A KPI that is zero every single week leaves MAPE undefined — but not un-storable."""
    blob = json.dumps(_summary(diagnostics=_diagnostics(mape=float("nan"))).to_json_dict())
    assert "NaN" not in blob
    assert json.loads(blob)["diagnostics"]["mape"] is None


def test_summary_with_a_zero_spend_channel_still_serialises():
    """A channel with no spend has no ROAS. `None` says that; `NaN` broke the insert."""
    channel = ChannelResult(
        name="never_ran",
        absolute_contribution=_iv(0.0),
        contribution_share=_iv(0.0),
        roas=None,
        adstock_half_life_weeks=_iv(2.0),
        saturation_point=_iv(0.0),
        total_spend=0.0,
        unit="currency",
    )
    blob = json.dumps(_summary(channels=[channel]).to_json_dict())
    assert "NaN" not in blob
    assert json.loads(blob)["channels"][0]["roas"] is None


def test_json_dumps_would_otherwise_emit_invalid_json():
    """Pin the reason this whole module exists, so nobody 'simplifies' it away.

    Python's json module accepts NaN by default and writes a bare `NaN` token. Every
    strict JSON parser — including the one in front of Postgres — rejects that.
    """
    assert json.dumps(float("nan")) == "NaN"
    with pytest.raises(ValueError):
        json.loads(json.dumps({"x": float("nan")}), parse_constant=_reject)


def _reject(token: str):
    raise ValueError(f"invalid JSON constant {token!r}")


# --- MAPE with zero weeks -----------------------------------------------------------


def test_mape_skips_zero_weeks_instead_of_poisoning_the_average():
    actual = np.array([100.0, 0.0, 200.0])
    resid = np.array([10.0, 5.0, -20.0])
    # 10/100 and 20/200 both give 0.1; the zero week has no percentage error at all.
    assert _safe_mape(actual, resid) == pytest.approx(0.1)


def test_mape_is_nan_only_when_every_week_is_zero():
    result = _safe_mape(np.zeros(4), np.ones(4))
    assert math.isnan(result)
    # ... and that NaN still survives serialisation as an honest "not applicable".
    assert _to_plain({"mape": result}) == {"mape": None}


def test_mape_is_unaffected_by_negative_actuals():
    actual = np.array([-100.0, 100.0])
    resid = np.array([10.0, 10.0])
    assert _safe_mape(actual, resid) == pytest.approx(0.1)
