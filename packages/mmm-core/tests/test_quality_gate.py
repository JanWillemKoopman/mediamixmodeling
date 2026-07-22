from mmm_core.model.fit import Diagnostics, FitSummary, Interval, recompute_quality_gate, _quality_gate


def _diag(**kw):
    base = dict(
        max_r_hat=1.0,
        min_ess_bulk=1000.0,
        n_divergences=0,
        r2=0.9,
        mape=0.05,
        interval_coverage_94=0.94,
        decomposition_ok=True,
    )
    base.update(kw)
    return Diagnostics(**base)


def test_clean_fit_passes():
    gate = _quality_gate(_diag(), n_samples=2000)
    assert gate.verdict == "pass"
    assert gate.reasons == []
    assert all(gate.checks.values())


def test_high_rhat_fails():
    gate = _quality_gate(_diag(max_r_hat=1.2), n_samples=2000)
    assert gate.verdict == "fail"
    assert not gate.checks["converged_r_hat"]


def test_slightly_high_rhat_warns():
    gate = _quality_gate(_diag(max_r_hat=1.07), n_samples=2000)
    assert gate.verdict == "warn"


def test_many_divergences_fail():
    gate = _quality_gate(_diag(n_divergences=100), n_samples=2000)  # 5% > 2%
    assert gate.verdict == "fail"
    assert not gate.checks["few_divergences"]


def test_a_few_divergences_warn():
    gate = _quality_gate(_diag(n_divergences=3), n_samples=2000)
    assert gate.verdict == "warn"


def test_broken_decomposition_fails():
    gate = _quality_gate(_diag(decomposition_ok=False), n_samples=2000)
    assert gate.verdict == "fail"


def test_low_r2_warns():
    gate = _quality_gate(_diag(r2=0.1), n_samples=2000)
    assert gate.verdict == "warn"


def test_failed_placebo_fails():
    gate = _quality_gate(_diag(), n_samples=2000, placebo_ok=False)
    assert gate.verdict == "fail"
    assert not gate.checks["placebo_clean"]


def test_weak_cv_warns():
    gate = _quality_gate(_diag(), n_samples=2000, cv_mape=0.4)
    assert gate.verdict == "warn"
    assert not gate.checks["cross_validation_ok"]


def test_fail_dominates_warn():
    gate = _quality_gate(_diag(max_r_hat=1.2, min_ess_bulk=10.0), n_samples=2000)
    assert gate.verdict == "fail"  # a warn condition present too, but fail wins


def _summary(**diag_kw) -> FitSummary:
    """A minimal FitSummary with a clean 'pass' quality gate and no channels/planning
    outputs — enough to exercise recompute_quality_gate without a real fit."""
    interval = Interval(0.0, 0.0, 0.0)
    diagnostics = _diag(**diag_kw)
    return FitSummary(
        kpi="revenue",
        n_weeks=52,
        window=("2024-01-01", "2024-12-30"),
        baseline_contribution=interval,
        channels=[],
        diagnostics=diagnostics,
        draws=1000,
        chains=4,
        quality_gate=_quality_gate(diagnostics, n_samples=4000),
    )


def test_recompute_quality_gate_only_touches_the_gate():
    summary = _summary()
    updated = recompute_quality_gate(summary, placebo_ok=True, cv_mape=0.1)
    assert updated.diagnostics == summary.diagnostics
    assert updated.channels == summary.channels
    assert updated.draws == summary.draws and updated.chains == summary.chains
    assert updated.quality_gate.verdict == "pass"


def test_recompute_quality_gate_placebo_failure_flips_verdict():
    summary = _summary()
    assert summary.quality_gate.verdict == "pass"
    updated = recompute_quality_gate(summary, placebo_ok=False)
    assert updated.quality_gate.verdict == "fail"
    assert not updated.quality_gate.checks["placebo_clean"]


def test_recompute_quality_gate_weak_cv_warns():
    summary = _summary()
    updated = recompute_quality_gate(summary, cv_mape=0.5)
    assert updated.quality_gate.verdict == "warn"
    assert not updated.quality_gate.checks["cross_validation_ok"]


def test_recompute_quality_gate_uses_draws_times_chains_for_divergence_fraction():
    # n_samples for the divergence-fraction check comes from summary.draws * summary.chains,
    # not a value the caller passes separately — a fixed absolute divergence count should
    # therefore fail/pass depending on that product.
    summary = _summary(n_divergences=90)  # 90 / (1000*4) = 2.25% > 2% fail threshold
    updated = recompute_quality_gate(summary, placebo_ok=True)
    assert updated.quality_gate.verdict == "fail"
    assert not updated.quality_gate.checks["few_divergences"]
