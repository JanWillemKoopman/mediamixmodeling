"""The four-rung validation ladder.

The property every test here defends: a converged sampler is the *floor*, not the verdict.
The pre-refactor gate could not express "the computation succeeded but the answer is not
trustworthy", so anything that sampled cleanly was shown as a result and could be
published with budget advice attached.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from mmm_core.model.fit import Diagnostics
from mmm_core.model.identify import assess_identifiability
from mmm_core.model.validate import (
    RULESET_VERSION,
    Output,
    ValidationLevel,
    validate_run,
)


def _diagnostics(**kw) -> Diagnostics:
    """A clean, healthy fit; override one field at a time to make it unhealthy."""
    defaults = dict(
        max_r_hat=1.0,
        min_ess_bulk=900.0,
        min_ess_tail=850.0,
        n_divergences=0,
        min_e_bfmi=0.9,
        n_max_treedepth=0,
        r2=0.85,
        mape=0.08,
        interval_coverage_94=0.94,
        interval_coverage_80=0.81,
        interval_coverage_50=0.52,
        residual_autocorrelation=0.05,
        decomposition_ok=True,
    )
    defaults.update(kw)
    return Diagnostics(**defaults)


def _identifiable(n: int = 3, seed: int = 0):
    rng = np.random.default_rng(seed)
    return assess_identifiability({f"ch{i}": rng.normal(100, 4, 3_000) for i in range(n)})


def _inseparable():
    rng = np.random.default_rng(1)
    shared = rng.normal(100, 20, 3_000)
    return assess_identifiability(
        {"a": shared + rng.normal(0, 1, 3_000), "b": 200 - shared + rng.normal(0, 1, 3_000)}
    )


# --- the ladder --------------------------------------------------------------------


def test_a_healthy_fit_without_identifiability_evidence_is_only_statistically_valid():
    """Budget advice needs evidence, not the absence of complaints.

    Without an identifiability assessment the question "can these channels be told apart"
    is simply unanswered — and recommending that someone move money on an unanswered
    question is not something to hand a user.
    """
    v = validate_run(_diagnostics(), n_samples=2_000)
    assert v.level is ValidationLevel.STATISTICALLY_VALID
    assert v.allows(Output.PUBLISH)
    assert v.allows(Output.CHANNEL_CONTRIBUTIONS)
    assert not v.allows(Output.BUDGET_ADVICE)


def test_full_evidence_reaches_the_top_rung():
    v = validate_run(
        _diagnostics(),
        n_samples=2_000,
        identifiability=_identifiable(),
        holdout_mape=0.12,
        placebo_share=0.005,
    )
    assert v.level is ValidationLevel.USABLE_FOR_DECISIONS
    assert v.allows(Output.BUDGET_ADVICE)
    assert v.allows(Output.RESPONSE_CURVES)


def test_sampling_can_succeed_while_the_model_is_not_trustworthy():
    """The rung that did not exist before.

    R-hat 1.00, no divergences, decomposition adds up — every convergence diagnostic is
    perfect. The model still does not describe the data, so no result may be shown.
    """
    v = validate_run(
        _diagnostics(interval_coverage_94=0.55, r2=0.35), n_samples=2_000
    )
    assert v.level is ValidationLevel.TECHNICALLY_COMPLETED
    assert v.allowed_outputs == frozenset({Output.DIAGNOSTICS})
    assert not v.allows(Output.PUBLISH)


@pytest.mark.parametrize(
    "kwargs, code",
    [
        ({"max_r_hat": 1.4}, "converged"),
        ({"n_divergences": 400}, "few_divergences"),
        ({"decomposition_ok": False}, "decomposition_adds_up"),
        ({"r2": 0.05}, "explains_the_data"),
    ],
)
def test_each_blocking_failure_makes_the_model_unusable(kwargs, code):
    v = validate_run(_diagnostics(**kwargs), n_samples=2_000)
    assert v.level is ValidationLevel.NOT_USABLE
    assert any(c.code == code and not c.passed for c in v.checks)
    assert v.allowed_outputs == frozenset({Output.DIAGNOSTICS})
    assert v.blocking_reasons


def test_a_placebo_channel_that_scores_blocks_the_whole_model():
    """If invented spend earns credit, none of the real channel numbers mean anything."""
    v = validate_run(_diagnostics(), n_samples=2_000, placebo_share=0.18)
    assert v.level is ValidationLevel.NOT_USABLE
    assert any("verzonnen kanaal" in r for r in v.blocking_reasons)


def test_no_identifiable_channel_at_all_blocks_the_model():
    v = validate_run(_diagnostics(), n_samples=2_000, identifiability=_inseparable())
    assert v.level is ValidationLevel.NOT_USABLE
    assert any(c.code == "any_channel_identifiable" and not c.passed for c in v.checks)


def test_poor_generalisation_keeps_budget_advice_locked():
    v = validate_run(
        _diagnostics(),
        n_samples=2_000,
        identifiability=_identifiable(),
        holdout_mape=0.55,   # badly overfitted
    )
    assert v.level < ValidationLevel.USABLE_FOR_DECISIONS
    assert not v.allows(Output.BUDGET_ADVICE)


def test_levels_are_ordered():
    assert ValidationLevel.NOT_USABLE < ValidationLevel.TECHNICALLY_COMPLETED
    assert ValidationLevel.TECHNICALLY_COMPLETED < ValidationLevel.STATISTICALLY_VALID
    assert ValidationLevel.STATISTICALLY_VALID < ValidationLevel.USABLE_FOR_DECISIONS
    assert ValidationLevel.USABLE_FOR_DECISIONS >= ValidationLevel.STATISTICALLY_VALID


# --- per-channel verdicts -----------------------------------------------------------


def test_a_sound_model_can_still_have_unusable_channels():
    """Model-level and channel-level verdicts are separate questions."""
    rng = np.random.default_rng(2)
    shared = rng.normal(100, 20, 3_000)
    identifiability = assess_identifiability(
        {
            "tv": rng.normal(80, 4, 3_000),                      # fine
            "sea_brand": shared + rng.normal(0, 1, 3_000),        # inseparable pair
            "sea_generic": 200 - shared + rng.normal(0, 1, 3_000),
        }
    )
    v = validate_run(
        _diagnostics(), n_samples=2_000, identifiability=identifiability, holdout_mape=0.1
    )
    assert v.level >= ValidationLevel.STATISTICALLY_VALID
    assert v.usable_channels() == ["tv"]
    assert v.inseparable_groups == (("sea_brand", "sea_generic"),)
    # ... and the user is told why, per channel, in their own language.
    blocked = [c for c in v.per_channel if not c.usable]
    assert blocked and all(c.reasons for c in blocked)


# --- serialisation and auditability ---------------------------------------------------


def test_validation_serialises_without_nan():
    v = validate_run(
        _diagnostics(mape=float("nan"), min_ess_tail=float("nan"), min_e_bfmi=float("nan")),
        n_samples=2_000,
    )
    blob = json.dumps(v.to_json_dict())
    assert "NaN" not in blob


def test_validation_records_the_ruleset_it_was_judged_under():
    """Tightening the bar later must never silently re-score an already published run."""
    v = validate_run(_diagnostics(), n_samples=2_000)
    assert v.ruleset_version == RULESET_VERSION
    assert v.to_json_dict()["ruleset_version"] == RULESET_VERSION


def test_every_failed_check_carries_a_message_a_marketer_can_act_on():
    v = validate_run(
        _diagnostics(max_r_hat=1.4, r2=0.1, interval_coverage_94=0.4), n_samples=2_000
    )
    for check in v.checks:
        if not check.passed:
            assert len(check.message) > 40, f"{check.code} has no usable explanation"
            assert not any(
                jargon in check.message for jargon in ("posterior", "MCMC", "Bayesi")
            ), f"{check.code} leaks statistical jargon to the user"


def test_missing_measurements_are_skipped_not_assumed_fine():
    # A NaN E-BFMI (sampler did not report it) must not be silently counted as a pass.
    v = validate_run(_diagnostics(min_e_bfmi=float("nan")), n_samples=2_000)
    assert not any(c.code == "energy_ok" for c in v.checks)


# --- a per-channel problem is not a model-level veto ---------------------------------


def _partly_inseparable():
    """Four channels, two of which always moved together.

    The realistic shape of a real account: most channels are fine, one pair is not.
    """
    rng = np.random.default_rng(7)
    shared = rng.normal(100, 20, 3_000)
    return assess_identifiability(
        {
            "twin_a": shared + rng.normal(0, 1, 3_000),
            "twin_b": 200 - shared + rng.normal(0, 1, 3_000),
            "clean_1": rng.normal(100, 4, 3_000),
            "clean_2": rng.normal(100, 4, 3_000),
        }
    )


def test_two_inseparable_channels_do_not_silence_advice_about_the_other_four():
    """The point of per-channel verdicts.

    An earlier version let any warning veto the top rung, so a single inseparable pair in a
    six-channel model blocked budget advice about every other channel too — which is both
    over-strict and the opposite of what a per-channel verdict is for. The pair still gets
    no individual number; the rest of the model is unaffected.
    """
    ident = _partly_inseparable()
    v = validate_run(
        _diagnostics(), n_samples=2_000, identifiability=ident, holdout_mape=0.12,
        placebo_share=0.01,
    )

    assert v.level is ValidationLevel.USABLE_FOR_DECISIONS
    assert v.allows(Output.BUDGET_ADVICE)

    unusable = {c.name for c in v.per_channel if not c.usable}
    assert unusable, "the inseparable pair must still be marked unusable"
    assert unusable <= {"twin_a", "twin_b"}
    # And the user is told, rather than it silently passing.
    assert any("kanaal" in w for w in v.warning_reasons)


def test_a_model_level_warning_still_blocks_budget_advice():
    """The relaxation above is narrow: only the per-channel verdict stops vetoing.

    A sampler whose interval edges rest on too few draws is a problem with the *model*, and
    budget advice is read off exactly those edges — so this must still block.
    """
    v = validate_run(
        _diagnostics(min_ess_tail=120.0),
        n_samples=2_000,
        identifiability=_identifiable(),
        holdout_mape=0.12,
        placebo_share=0.01,
    )
    assert v.level is ValidationLevel.STATISTICALLY_VALID
    assert not v.allows(Output.BUDGET_ADVICE)


# --- the MediaMarkt run: what the old ruleset waved through ----------------------------


def _check(validation, code):
    return next(c for c in validation.checks if c.code == code)


def test_a_placebo_that_outranks_half_the_channels_blocks():
    """The run that prompted this: placebo at 3.3% passed a 5% ceiling while outscoring
    six of ten channels. If a channel with no spend beats half the real ones, the ranking
    those channels are read in is noise — whatever the absolute number says."""
    shares = [0.0469, 0.0488, 0.0464, 0.0403, 0.0282, 0.0281, 0.0242, 0.0086, 0.0084, 0.0037]
    validation = validate_run(
        _diagnostics(), n_samples=4000, placebo_share=0.0333, channel_shares=shares,
    )
    check = _check(validation, "placebo_clean")
    assert not check.passed
    assert check.severity == "blocking"
    assert "6 van je 10" in check.message


def test_a_genuinely_negligible_placebo_still_passes():
    shares = [0.0469, 0.0488, 0.0464, 0.0403, 0.0282, 0.0281, 0.0242, 0.0086, 0.0084, 0.0037]
    validation = validate_run(
        _diagnostics(), n_samples=4000, placebo_share=0.002, channel_shares=shares,
    )
    assert _check(validation, "placebo_clean").passed


def test_the_absolute_ceiling_still_applies_without_channel_shares():
    validation = validate_run(_diagnostics(), n_samples=4000, placebo_share=0.09)
    assert not _check(validation, "placebo_clean").passed


def test_a_wide_inner_band_is_caught_even_when_the_outer_one_looks_fine():
    """94%→99% sits inside tolerance, so the old single-band check passed a model whose
    50% band covered 80% of weeks. Intervals that wide make every channel look
    unmeasurable, and the report then blames the user's data for it."""
    diagnostics = _diagnostics(
        interval_coverage_94=0.99, interval_coverage_80=0.975, interval_coverage_50=0.80,
    )
    validation = validate_run(diagnostics, n_samples=4000)
    check = _check(validation, "uncertainty_is_calibrated")
    assert not check.passed
    assert "50%-marge" in check.message
    assert "80%" in check.message


def test_well_calibrated_bands_pass():
    validation = validate_run(_diagnostics(), n_samples=4000)
    assert _check(validation, "uncertainty_is_calibrated").passed
