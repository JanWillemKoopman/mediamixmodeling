import numpy as np
import pytest

from mmm_core.optimize import (
    ChannelResponse,
    allocate_incremental_budget,
    average_roas,
    efficiency_frontier,
    efficiency_frontier_count,
    marginal_roas,
    optimize_budget,
    optimize_budget_count,
    predict_total_contribution,
    response_curve,
)


def _channel(name, beta=0.4, half_sat=0.3, slope=1.0, x_max=1000.0, y_max=50000.0,
             hist_max=800.0, n=400, spread=0.02, seed=0):
    """A channel with tight posterior samples around fixed parameters (concave, slope=1)."""
    rng = np.random.default_rng(seed)
    return ChannelResponse(
        name=name,
        beta=rng.normal(beta, beta * spread, n),
        half_saturation=rng.normal(half_sat, half_sat * spread, n),
        slope=rng.normal(slope, slope * spread, n),
        x_max=x_max,
        y_max=y_max,
        hist_max_weekly_spend=hist_max,
    )


def test_response_curve_is_monotonic_and_flags_extrapolation():
    ch = _channel("search")
    curve = response_curve(ch, n_points=30, cap_factor=1.2)
    mids = [p.contribution.p50 for p in curve]
    assert all(b >= a - 1e-9 for a, b in zip(mids, mids[1:]))  # non-decreasing
    assert curve[0].contribution.p50 == pytest.approx(0.0, abs=1e-6)  # zero spend -> ~0
    # points beyond the historical max are flagged as extrapolated.
    assert any(p.extrapolated for p in curve)
    assert all(not p.extrapolated for p in curve if p.weekly_spend <= ch.hist_max_weekly_spend)


def test_marginal_roas_is_positive_and_below_average_for_concave_channel():
    ch = _channel("search", slope=1.0)
    spend = 400.0
    m = marginal_roas(ch, spend)
    a = average_roas(ch, spend)
    assert m.p50 > 0
    # diminishing returns: the next euro returns less than the average euro so far.
    assert m.p50 < a.p50


def test_marginal_roas_decreases_with_spend():
    ch = _channel("search", slope=1.0)
    low = marginal_roas(ch, 200.0).p50
    high = marginal_roas(ch, 700.0).p50
    assert high < low


def test_optimize_allocates_more_to_the_more_efficient_channel():
    # same shape, but 'strong' has a higher ceiling -> should receive more budget.
    strong = _channel("strong", beta=0.6, hist_max=800.0, seed=1)
    weak = _channel("weak", beta=0.2, hist_max=800.0, seed=2)
    alloc = optimize_budget([strong, weak], total_budget=600.0)
    assert alloc.per_channel["strong"] > alloc.per_channel["weak"]
    assert sum(alloc.per_channel.values()) == pytest.approx(600.0, rel=1e-3)


def test_optimize_respects_safety_caps():
    a = _channel("a", hist_max=100.0, seed=1)
    b = _channel("b", hist_max=100.0, seed=2)
    # budget exceeds the sum of both caps (100*1.2*2 = 240); allocation clamps to caps.
    alloc = optimize_budget([a, b], total_budget=1000.0, cap_factor=1.2)
    assert alloc.per_channel["a"] <= 120.0 + 1e-6
    assert alloc.per_channel["b"] <= 120.0 + 1e-6
    assert alloc.total_budget == pytest.approx(240.0)
    assert set(alloc.capped_channels) == {"a", "b"}


def test_predict_total_contribution_has_interval():
    ch = _channel("search")
    iv = predict_total_contribution([ch], {"search": 400.0})
    assert iv.p3 <= iv.p50 <= iv.p97


def test_predicted_revenue_grows_with_budget():
    strong = _channel("strong", beta=0.6, seed=1)
    weak = _channel("weak", beta=0.2, seed=2)
    small = optimize_budget([strong, weak], total_budget=300.0)
    large = optimize_budget([strong, weak], total_budget=900.0)
    assert large.predicted_contribution.p50 > small.predicted_contribution.p50


def test_negative_budget_raises():
    ch = _channel("x")
    with pytest.raises(ValueError):
        optimize_budget([ch], total_budget=0.0)


# --- constraints -----------------------------------------------------------------

def test_min_spend_is_respected():
    strong = _channel("strong", beta=0.6, seed=1)
    weak = _channel("weak", beta=0.2, seed=2)
    # force a floor on the weak channel that the optimiser would otherwise starve.
    alloc = optimize_budget([strong, weak], total_budget=600.0, min_spend={"weak": 250.0})
    assert alloc.per_channel["weak"] >= 250.0 - 1e-6
    assert sum(alloc.per_channel.values()) == pytest.approx(600.0, rel=1e-3)


def test_max_spend_caps_below_safety_cap():
    strong = _channel("strong", beta=0.6, seed=1)
    weak = _channel("weak", beta=0.2, seed=2)
    alloc = optimize_budget([strong, weak], total_budget=600.0, max_spend={"strong": 100.0})
    assert alloc.per_channel["strong"] <= 100.0 + 1e-6


def test_min_spend_exceeding_budget_raises():
    ch = _channel("x")
    with pytest.raises(ValueError):
        optimize_budget([ch], total_budget=100.0, min_spend={"x": 200.0})


# --- efficiency frontier ---------------------------------------------------------

def test_efficiency_frontier_is_increasing_and_concave_ish():
    strong = _channel("strong", beta=0.6, seed=1)
    weak = _channel("weak", beta=0.3, seed=2)
    pts = efficiency_frontier([strong, weak], budgets=[200.0, 400.0, 800.0, 1200.0])
    contribs = [p.predicted_contribution.p50 for p in pts]
    # more budget never predicts less contribution
    assert all(b >= a - 1e-6 for a, b in zip(contribs, contribs[1:]))
    # diminishing returns: the first increment adds more than the last
    gains = [b - a for a, b in zip(contribs, contribs[1:])]
    assert gains[0] >= gains[-1] - 1e-6


# --- incremental budget ----------------------------------------------------------

def test_incremental_budget_never_cuts_below_current_and_spends_extra_well():
    strong = _channel("strong", beta=0.6, hist_max=800.0, seed=1)
    weak = _channel("weak", beta=0.2, hist_max=800.0, seed=2)
    current = {"strong": 100.0, "weak": 100.0}
    alloc = allocate_incremental_budget([strong, weak], extra_budget=200.0, current=current)
    assert alloc.per_channel["strong"] >= 100.0 - 1e-6
    assert alloc.per_channel["weak"] >= 100.0 - 1e-6
    assert sum(alloc.per_channel.values()) == pytest.approx(400.0, rel=1e-3)
    # the extra should favour the stronger channel
    assert alloc.per_channel["strong"] - 100.0 > alloc.per_channel["weak"] - 100.0


def test_incremental_zero_extra_returns_current():
    ch = _channel("x", hist_max=800.0)
    alloc = allocate_incremental_budget([ch], extra_budget=0.0, current={"x": 150.0})
    assert alloc.per_channel["x"] == pytest.approx(150.0, rel=1e-3)


# --- count/log-link planning outputs ----------------------------------------------

def test_count_contribution_is_zero_at_zero_spend():
    ch = _channel("search")
    other = np.full(400, 5.0)  # log(≈148) — an arbitrary steady-state "everything else"
    samples = ch.contribution_samples(0.0, other_log_effect=other)
    assert np.allclose(samples, 0.0)


def test_count_contribution_is_monotonic_in_spend():
    ch = _channel("search")
    other = np.full(400, 5.0)
    curve = response_curve(ch, n_points=25, cap_factor=1.2, other_log_effect=other)
    p50s = [p.contribution.p50 for p in curve]
    assert all(b >= a - 1e-9 for a, b in zip(p50s, p50s[1:]))
    p3s = [p.contribution.p3 for p in curve]
    p97s = [p.contribution.p97 for p in curve]
    assert all(b >= a - 1e-9 for a, b in zip(p3s, p3s[1:]))
    assert all(b >= a - 1e-9 for a, b in zip(p97s, p97s[1:]))


def test_count_contribution_matches_manual_exp_formula():
    ch = _channel("search")
    other = np.full(400, 4.2)
    spend = 500.0
    got = ch.contribution_samples(spend, other_log_effect=other)
    own = ch.own_log_effect(spend)
    expected = np.exp(other + own) - np.exp(other)
    assert np.allclose(got, expected)


def test_count_contribution_reduces_to_first_order_taylor_for_small_effects():
    # exp(a + b) - exp(a) == exp(a) * b + O(b^2); for a tiny own-effect this should match
    # exp(a) * b closely, confirming the exp-based formula isn't doing anything more exotic.
    ch = _channel("search", beta=0.0005)  # tiny beta -> tiny own_log_effect at any spend
    other = np.full(400, 3.0)
    spend = 200.0
    got = ch.contribution_samples(spend, other_log_effect=other)
    own = ch.own_log_effect(spend)
    taylor = np.exp(other) * own
    assert np.allclose(got, taylor, rtol=1e-2)


def test_marginal_roas_count_is_positive_for_a_growing_channel():
    ch = _channel("search")
    other = np.full(400, 5.0)
    m = marginal_roas(ch, 400.0, other_log_effect=other)
    assert m.p50 > 0


def _count_channels():
    strong = _channel("strong", beta=0.6, hist_max=800.0, seed=1)
    weak = _channel("weak", beta=0.2, hist_max=800.0, seed=2)
    return strong, weak


def test_optimize_budget_count_respects_total_budget():
    strong, weak = _count_channels()
    other = np.full(400, 5.0)
    alloc = optimize_budget_count([strong, weak], other, total_budget=600.0)
    assert sum(alloc.per_channel.values()) == pytest.approx(600.0, rel=1e-3)
    assert alloc.total_budget == pytest.approx(600.0, rel=1e-6)


def test_optimize_budget_count_favours_the_stronger_channel():
    strong, weak = _count_channels()
    other = np.full(400, 5.0)
    alloc = optimize_budget_count([strong, weak], other, total_budget=600.0)
    assert alloc.per_channel["strong"] > alloc.per_channel["weak"]


def test_optimize_budget_count_respects_caps():
    a = _channel("a", beta=5.0, hist_max=100.0, seed=1)   # very strong, small cap
    b = _channel("b", beta=0.05, hist_max=5000.0, seed=2)  # weak, huge cap
    other = np.full(400, 5.0)
    alloc = optimize_budget_count([a, b], other, total_budget=1000.0, cap_factor=1.2)
    assert alloc.per_channel["a"] <= a.cap(1.2) + 1e-6
    assert "a" in alloc.capped_channels


def test_optimize_budget_count_rejects_non_positive_budget():
    ch = _channel("x")
    other = np.full(400, 5.0)
    with pytest.raises(ValueError):
        optimize_budget_count([ch], other, total_budget=0.0)


def test_optimize_budget_count_predicted_contribution_matches_manual_formula():
    strong, weak = _count_channels()
    other = np.full(400, 5.0)
    alloc = optimize_budget_count([strong, weak], other, total_budget=600.0)
    joint_own = strong.own_log_effect(alloc.per_channel["strong"]) + weak.own_log_effect(
        alloc.per_channel["weak"]
    )
    expected_p50 = float(np.percentile(np.exp(other + joint_own) - np.exp(other), 50))
    assert alloc.predicted_contribution.p50 == pytest.approx(expected_p50, rel=1e-6)


def test_efficiency_frontier_count_more_budget_predicts_more():
    strong, weak = _count_channels()
    other = np.full(400, 5.0)
    points = efficiency_frontier_count([strong, weak], other, budgets=[300.0, 900.0])
    assert points[0].total_budget < points[1].total_budget
    assert points[1].predicted_contribution.p50 > points[0].predicted_contribution.p50
