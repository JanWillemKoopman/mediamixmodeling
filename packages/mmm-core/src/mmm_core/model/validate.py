"""Is this model good enough — and good enough for *what*?

The pre-refactor system had one boolean-ish verdict (pass/warn/fail) produced from
convergence diagnostics, and nothing downstream was gated on it: a model that failed could
still be published, and the client dashboard showed budget advice either way. That is the
most dangerous shape a product like this can have, because a converged sampler on
unidentifiable data produces confident, precise-looking, wrong numbers.

This module replaces that with a four-rung ladder, because "is the model good" is not one
question:

``NOT_USABLE``
    Something is broken. The sampler did not converge, or the decomposition does not add
    up, or no channel is identifiable. Show diagnostics; show no results.

``TECHNICALLY_COMPLETED``
    Sampling finished cleanly, but the model does not describe the data well enough to
    believe. This is the rung that did not exist before, and it is the one that matters:
    "the computation succeeded" is not a statement about the answer.

``STATISTICALLY_VALID``
    The sampler is sound *and* the model describes the data with calibrated uncertainty.
    Totals and per-channel contributions may be shown, with their caveats. Publishable.

``USABLE_FOR_DECISIONS``
    All of the above, plus: the channels are actually identifiable and the model
    generalises out of sample. Only here may the product give budget advice, because only
    here does moving money on the basis of it make sense.

Per-channel verdicts are separate from the model-level one: a model can be perfectly sound
overall while two of its six channels are inseparable. Those two get no individual number,
and the reason is written out in the user's language.

Thresholds are module constants so the bar is auditable rather than buried in branches,
and every :class:`ModelValidation` records the ``ruleset_version`` it was judged under, so
tightening the bar later never silently re-scores a run that was already published.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import Enum

import math

from mmm_core.model.identify import IdentifiabilityReport, NOT_IDENTIFIED, WEAK

# Bumped whenever a threshold or rule below changes. Stored alongside every verdict.
# 2024.3: the placebo is judged against the model's own channel effects as well as the
# absolute ceiling, and all three coverage bands are checked instead of only the 94% one.
RULESET_VERSION = "2024.3"


class ValidationLevel(str, Enum):
    NOT_USABLE = "not_usable"
    TECHNICALLY_COMPLETED = "technically_completed"
    STATISTICALLY_VALID = "statistically_valid"
    USABLE_FOR_DECISIONS = "usable_for_decisions"

    @property
    def rank(self) -> int:
        return _LEVEL_RANK[self]

    def __ge__(self, other: "ValidationLevel") -> bool:  # type: ignore[override]
        return self.rank >= other.rank

    def __gt__(self, other: "ValidationLevel") -> bool:  # type: ignore[override]
        return self.rank > other.rank

    def __le__(self, other: "ValidationLevel") -> bool:  # type: ignore[override]
        return self.rank <= other.rank

    def __lt__(self, other: "ValidationLevel") -> bool:  # type: ignore[override]
        return self.rank < other.rank


_LEVEL_RANK = {
    ValidationLevel.NOT_USABLE: 0,
    ValidationLevel.TECHNICALLY_COMPLETED: 1,
    ValidationLevel.STATISTICALLY_VALID: 2,
    ValidationLevel.USABLE_FOR_DECISIONS: 3,
}


class Output(str, Enum):
    """A result surface the product may show. Gated on the validation level."""

    DIAGNOSTICS = "diagnostics"                      # always
    TOTAL_MEDIA_CONTRIBUTION = "total_media_contribution"
    CHANNEL_CONTRIBUTIONS = "channel_contributions"  # further filtered per channel
    RESPONSE_CURVES = "response_curves"
    BUDGET_ADVICE = "budget_advice"
    PUBLISH = "publish"


# What each rung unlocks. Publishing is allowed from STATISTICALLY_VALID (with the caveats
# shown), but budget advice needs the top rung: recommending that someone move money is a
# stronger claim than reporting what happened.
_ALLOWED: dict[ValidationLevel, frozenset[Output]] = {
    ValidationLevel.NOT_USABLE: frozenset({Output.DIAGNOSTICS}),
    ValidationLevel.TECHNICALLY_COMPLETED: frozenset({Output.DIAGNOSTICS}),
    ValidationLevel.STATISTICALLY_VALID: frozenset(
        {
            Output.DIAGNOSTICS,
            Output.TOTAL_MEDIA_CONTRIBUTION,
            Output.CHANNEL_CONTRIBUTIONS,
            Output.PUBLISH,
        }
    ),
    ValidationLevel.USABLE_FOR_DECISIONS: frozenset(
        {
            Output.DIAGNOSTICS,
            Output.TOTAL_MEDIA_CONTRIBUTION,
            Output.CHANNEL_CONTRIBUTIONS,
            Output.RESPONSE_CURVES,
            Output.BUDGET_ADVICE,
            Output.PUBLISH,
        }
    ),
}


# --- thresholds, deliberately explicit --------------------------------------------
# Sampler
RHAT_BLOCKING = 1.1        # above: chains disagree, the posterior is not a posterior
RHAT_WARN = 1.05
DIVERGENCE_BLOCKING_FRACTION = 0.02
ESS_BULK_WARN = 400.0
ESS_TAIL_WARN = 400.0      # the credible interval is a tail statement
EBFMI_WARN = 0.3

# Fit
R2_BLOCKING = 0.3          # below: the model explains almost none of the variation
R2_WARN = 0.5
COVERAGE_TOLERANCE = 0.1
MAPE_WARN = 0.25
RESIDUAL_AUTOCORRELATION_WARN = 0.4   # structure the model is still missing

# Generalisation
HOLDOUT_MAPE_WARN = 0.30
PLACEBO_SHARE_BLOCKING = 0.05   # a random channel must get ~nothing, in absolute terms
# ...and must also stay below the middle real channel: a placebo that outscores half the
# channels makes the ranking meaningless however small it looks on its own.


@dataclass(frozen=True)
class ValidationCheck:
    """One named check, its outcome, and what it means in the user's language."""

    code: str
    passed: bool
    severity: str            # "blocking" | "warning" | "info"
    message: str             # Dutch, user-facing
    value: float | None = None


@dataclass(frozen=True)
class ChannelVerdict:
    """Whether one channel's own number may be shown."""

    name: str
    usable: bool
    reasons: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ModelValidation:
    """The judgement, kept separate from the measurements it was made on."""

    level: ValidationLevel
    checks: tuple[ValidationCheck, ...]
    per_channel: tuple[ChannelVerdict, ...]
    inseparable_groups: tuple[tuple[str, ...], ...] = ()
    ruleset_version: str = RULESET_VERSION

    @property
    def blocking_reasons(self) -> list[str]:
        return [c.message for c in self.checks if not c.passed and c.severity == "blocking"]

    @property
    def warning_reasons(self) -> list[str]:
        return [c.message for c in self.checks if not c.passed and c.severity == "warning"]

    @property
    def allowed_outputs(self) -> frozenset[Output]:
        return _ALLOWED[self.level]

    def allows(self, output: Output) -> bool:
        return output in self.allowed_outputs

    def usable_channels(self) -> list[str]:
        return [c.name for c in self.per_channel if c.usable]

    def to_json_dict(self) -> dict:
        return {
            "level": self.level.value,
            "ruleset_version": self.ruleset_version,
            "allowed_outputs": sorted(o.value for o in self.allowed_outputs),
            "blocking_reasons": self.blocking_reasons,
            "warning_reasons": self.warning_reasons,
            "checks": [
                {
                    "code": c.code,
                    "passed": c.passed,
                    "severity": c.severity,
                    "message": c.message,
                    "value": None if c.value is None or not math.isfinite(c.value) else c.value,
                }
                for c in self.checks
            ],
            "per_channel": [
                {"name": c.name, "usable": c.usable, "reasons": c.reasons}
                for c in self.per_channel
            ],
            "inseparable_groups": [list(g) for g in self.inseparable_groups],
        }


def _check(code, passed, severity, message, value=None) -> ValidationCheck:
    return ValidationCheck(code=code, passed=passed, severity=severity, message=message, value=value)


def _finite(x: float | None) -> bool:
    return x is not None and math.isfinite(x)


def _median(values: list[float]) -> float:
    """Median of an already-sorted, non-empty list."""
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2.0


def validate_run(
    diagnostics,
    *,
    n_samples: int,
    identifiability: IdentifiabilityReport | None = None,
    holdout_mape: float | None = None,
    placebo_share: float | None = None,
    channel_shares: Sequence[float] | None = None,
) -> ModelValidation:
    """Judge a completed fit.

    Args:
        diagnostics: the :class:`mmm_core.model.fit.Diagnostics` produced by the fit.
        n_samples: total posterior draws (chains x draws), for the divergence fraction.
        identifiability: per-channel identifiability, if it was assessed. Without it the
            model cannot reach ``USABLE_FOR_DECISIONS`` — not because it is presumed bad,
            but because "can these channels be told apart" is unanswered, and budget advice
            on an unanswered question is not something to hand a user.
        holdout_mape: out-of-sample error from a held-back window, if measured.
        placebo_share: contribution share attributed to a deliberately random channel.
        channel_shares: each real channel's contribution share, used to judge the placebo
            against the effect sizes this model actually reports rather than against a
            fixed percentage that cannot know how big a real channel is here.
    """
    d = diagnostics
    checks: list[ValidationCheck] = []

    # --- 1. did the sampler produce a posterior at all? -------------------------
    checks.append(
        _check(
            "converged",
            d.max_r_hat <= RHAT_BLOCKING,
            "blocking",
            f"De berekening is niet tot een stabiel antwoord gekomen (R-hat {d.max_r_hat:.3f} "
            f"> {RHAT_BLOCKING}). De verschillende rekenpogingen zijn het niet met elkaar eens, "
            f"dus de uitkomst is geen betrouwbare schatting.",
            d.max_r_hat,
        )
    )
    if RHAT_WARN < d.max_r_hat <= RHAT_BLOCKING:
        checks.append(
            _check("convergence_tight", False, "warning",
                   f"De convergentie is krap (R-hat {d.max_r_hat:.3f}); lees de uitkomst met aandacht.",
                   d.max_r_hat)
        )

    div_fraction = d.n_divergences / max(n_samples, 1)
    checks.append(
        _check(
            "few_divergences",
            div_fraction <= DIVERGENCE_BLOCKING_FRACTION,
            "blocking",
            f"De berekening liep te vaak vast ({d.n_divergences} keer, {div_fraction:.1%} van "
            f"de pogingen). Delen van de uitkomst zijn daardoor niet verkend.",
            div_fraction,
        )
    )
    if 0 < d.n_divergences and div_fraction <= DIVERGENCE_BLOCKING_FRACTION:
        checks.append(
            _check("some_divergences", False, "warning",
                   f"De berekening liep {d.n_divergences} keer kort vast — meestal onschuldig, "
                   f"maar het is een teken dat het model krap zit.",
                   float(d.n_divergences))
        )

    checks.append(
        _check("enough_effective_samples", d.min_ess_bulk >= ESS_BULK_WARN, "warning",
               f"Weinig effectieve rekenpunten (minimaal {d.min_ess_bulk:.0f}); de schatting is "
               f"ruizig. Meer rondes helpen.",
               d.min_ess_bulk)
    )
    if _finite(d.min_ess_tail):
        checks.append(
            _check("enough_tail_samples", d.min_ess_tail >= ESS_TAIL_WARN, "warning",
                   f"De randen van de bandbreedte zijn op weinig punten gebaseerd "
                   f"(minimaal {d.min_ess_tail:.0f}); de onzekerheidsmarges zelf zijn onzeker.",
                   d.min_ess_tail)
        )
    if _finite(d.min_e_bfmi):
        checks.append(
            _check("energy_ok", d.min_e_bfmi >= EBFMI_WARN, "warning",
                   f"De berekening kon het gebied van mogelijke uitkomsten moeilijk aflopen "
                   f"(E-BFMI {d.min_e_bfmi:.2f}); vaak een teken dat het model te strak staat.",
                   d.min_e_bfmi)
        )

    # --- 2. does the decomposition hold together? --------------------------------
    checks.append(
        _check("decomposition_adds_up", d.decomposition_ok, "blocking",
               "De opbouw van het resultaat telt niet op tot het totaal — de uitsplitsing over "
               "kanalen en basislijn klopt intern niet.")
    )

    # --- 3. does the model describe the data? ------------------------------------
    checks.append(
        _check("explains_the_data", d.r2 >= R2_BLOCKING, "blocking",
               f"Het model verklaart bijna niets van de schommelingen in je KPI (R² {d.r2:.2f}). "
               f"Er ontbreekt waarschijnlijk een belangrijke verklarende variabele.",
               d.r2)
    )
    if R2_BLOCKING <= d.r2 < R2_WARN:
        checks.append(
            _check("explains_the_data_weakly", False, "warning",
                   f"Het model verklaart minder dan de helft van de schommelingen (R² {d.r2:.2f}).",
                   d.r2)
        )

    # All three bands, not just the outermost. A 94% band is wide enough to cover almost
    # anything, so on its own it passes models whose uncertainty is badly scaled: the run
    # that prompted this had 94%→99% (inside tolerance) while its 50% band covered 80% of
    # weeks. Intervals that wide make every channel look unmeasurable, and the report then
    # blames the user's data for a spread the model invented.
    bands = [
        (0.50, d.interval_coverage_50),
        (0.80, d.interval_coverage_80),
        (0.94, d.interval_coverage_94),
    ]
    off = [
        (nominal, actual)
        for nominal, actual in bands
        if _finite(actual) and abs(actual - nominal) > COVERAGE_TOLERANCE
    ]
    worst = max(off, key=lambda b: abs(b[1] - b[0]), default=None)
    checks.append(
        _check("uncertainty_is_calibrated", not off, "warning",
               f"De onzekerheidsmarges kloppen niet goed: de {worst[0]:.0%}-marge dekt "
               f"{worst[1]:.0%} van de werkelijke weken in plaats van {worst[0]:.0%}"
               + (f" ({len(off)} van de 3 marges wijken af)" if len(off) > 1 else "")
               + ". De marges zelf zijn dan niet te vertrouwen."
               if worst is not None else
               "De onzekerheidsmarges kloppen niet goed.",
               d.interval_coverage_94)
    )

    if _finite(d.mape):
        checks.append(
            _check("prediction_error_ok", d.mape <= MAPE_WARN, "warning",
                   f"De voorspelling zit gemiddeld {d.mape:.0%} naast de werkelijke KPI.",
                   d.mape)
        )

    if _finite(d.residual_autocorrelation):
        ok = abs(d.residual_autocorrelation) <= RESIDUAL_AUTOCORRELATION_WARN
        checks.append(
            _check("no_leftover_structure", ok, "warning",
                   f"Het model loopt systematisch voor of achter op de werkelijkheid "
                   f"(samenhang tussen opeenvolgende weken {d.residual_autocorrelation:+.2f}). "
                   f"Er zit nog structuur in je data die het model niet meeneemt.",
                   d.residual_autocorrelation)
        )

    # --- 4. does it generalise? ---------------------------------------------------
    if holdout_mape is not None and math.isfinite(holdout_mape):
        checks.append(
            _check("generalises", holdout_mape <= HOLDOUT_MAPE_WARN, "warning",
                   f"Op weken die het model niet gezien heeft zit de voorspelling "
                   f"{holdout_mape:.0%} ernaast — het model past zich te veel aan de bekende "
                   f"periode aan.",
                   holdout_mape)
        )
    if placebo_share is not None and math.isfinite(placebo_share):
        placebo = abs(placebo_share)
        # Two ways to fail, and the second is the one that matters.
        #
        # The absolute ceiling catches a model that hands out effect wholesale. But a
        # placebo can sit well under it and still be damning: if a channel with no spend
        # at all outscores half the real ones, the ranking those channels are read in is
        # noise, whatever the absolute number is. A fixed 5% cannot see that — it passed a
        # 3.3% placebo that outranked six of ten channels. So the threshold is also read
        # against the effects this very model reports.
        real = sorted(s for s in (channel_shares or ()) if math.isfinite(s))
        typical = _median(real) if real else None
        outranked = sum(1 for s in real if abs(s) < placebo)
        ok = placebo <= PLACEBO_SHARE_BLOCKING and (typical is None or placebo < abs(typical))
        detail = (
            f"Een verzonnen kanaal zonder enige echte uitgave krijgt {placebo_share:.1%} van "
            f"de KPI toegewezen"
        )
        if typical is not None and placebo >= abs(typical):
            detail += (
                f" — meer dan {outranked} van je {len(real)} kanalen zelf krijgen "
                f"(middelste kanaal: {abs(typical):.1%})"
            )
        checks.append(
            _check("placebo_clean", ok, "blocking",
                   f"{detail}. Het model kent effect toe aan toeval, dus de echte "
                   f"kanaalcijfers zijn niet te vertrouwen.",
                   placebo_share)
        )

    # --- 5. per-channel identifiability -------------------------------------------
    per_channel: list[ChannelVerdict] = []
    inseparable: tuple[tuple[str, ...], ...] = ()
    if identifiability is not None:
        inseparable = identifiability.inseparable_groups
        for ci in identifiability.channels:
            per_channel.append(
                ChannelVerdict(name=ci.name, usable=ci.is_usable, reasons=list(ci.reasons))
            )
        unusable = identifiability.unusable_channels
        checks.append(
            _check(
                "any_channel_identifiable",
                len(unusable) < len(identifiability.channels),
                "blocking",
                "Geen enkel kanaal is los van de andere vast te stellen. Het model kan wel "
                "zeggen wat marketing als geheel deed, maar niet hoe dat over de kanalen "
                "verdeeld is.",
            )
        )
        if unusable and len(unusable) < len(identifiability.channels):
            checks.append(
                _check(
                    "all_channels_identifiable", False, "warning",
                    f"Voor {len(unusable)} kanaal/kanalen ({', '.join(unusable)}) kan het model "
                    f"geen apart cijfer geven; die worden niet los gerapporteerd.",
                )
            )

    # --- the ladder ----------------------------------------------------------------
    blocking_failed = any(not c.passed and c.severity == "blocking" for c in checks)
    warnings_failed = [c for c in checks if not c.passed and c.severity == "warning"]

    if blocking_failed:
        level = ValidationLevel.NOT_USABLE
    else:
        # "Sampling finished" is the floor, not the verdict. A model only climbs to
        # STATISTICALLY_VALID if the fit itself — not just the sampler — holds up.
        fit_codes = {
            "uncertainty_is_calibrated",
            "explains_the_data_weakly",
            "prediction_error_ok",
            "no_leftover_structure",
        }
        fit_problems = [c for c in warnings_failed if c.code in fit_codes]
        if fit_problems:
            level = ValidationLevel.TECHNICALLY_COMPLETED
        else:
            level = ValidationLevel.STATISTICALLY_VALID
            # The top rung needs evidence, not the absence of complaints: identifiability
            # must have been assessed and at least one channel must survive it, and the
            # model must have been tried on data it did not see.
            has_identifiable = bool(identifiability and identifiability.usable_channels_exist())
            generalises = holdout_mape is not None and math.isfinite(holdout_mape) and (
                holdout_mape <= HOLDOUT_MAPE_WARN
            )
            # `all_channels_identifiable` is a verdict about *particular channels*, and it
            # is already acted on: those channels get no individual number and the budget
            # optimiser holds them fixed. Letting it veto the whole model as well would mean
            # one inseparable pair in a six-channel model silences advice about the other
            # four — the opposite of what per-channel verdicts are for. Every other warning
            # is about the model or the sampler as a whole and does still block.
            model_level_warnings = [
                c for c in warnings_failed if c.code != "all_channels_identifiable"
            ]
            if has_identifiable and generalises and not model_level_warnings:
                level = ValidationLevel.USABLE_FOR_DECISIONS

    return ModelValidation(
        level=level,
        checks=tuple(checks),
        per_channel=tuple(per_channel),
        inseparable_groups=inseparable,
    )
