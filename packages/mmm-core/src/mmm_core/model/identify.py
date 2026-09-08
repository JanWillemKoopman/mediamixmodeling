"""Can the data actually tell these channels apart?

A converged sampler says the algorithm worked. It says nothing about whether the *data*
contained enough information to separate one channel from another, or a channel from the
baseline. That distinction is the whole difficulty of media mix modelling: channels are
budgeted together, they move together, and a model will happily report a precise-looking
contribution for a channel whose effect it could not possibly have measured.

The pre-refactor quality gate checked R-hat, ESS, divergences, coverage, R-squared and
whether the decomposition added up — every one of which a completely unidentified model
passes. This module adds the checks that actually catch it:

* **Prior-posterior overlap.** If the posterior for a channel's effect looks like its
  prior, the data said nothing and the number on screen is the assumption, restated.
* **Posterior correlation between contributions.** Two channels that always moved together
  produce a posterior where one channel's contribution can be traded against the other's
  at no cost to the fit. The individual numbers are then arbitrary; only their sum is
  identified.
* **Relative interval width.** A contribution whose credible interval is wider than the
  estimate itself is not a measurement anyone can act on.
* **Prior sensitivity.** Refit with deliberately looser priors: a channel whose answer
  moves a lot was being held in place by the prior, not the data.

Everything here is pure numpy over posterior sample arrays, so it is testable without
running a fit.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Above this overlap between prior and posterior, the data has added essentially nothing
# to what was assumed. 0.8 is deliberately generous: below it there is at least a visible
# update.
PRIOR_POSTERIOR_OVERLAP_WEAK = 0.7
PRIOR_POSTERIOR_OVERLAP_UNIDENTIFIED = 0.9

# |correlation| between two channels' posterior contributions. Above the second threshold
# the model is trading one channel off against the other at no cost to the fit, which
# means the split between them is arbitrary.
CONTRIBUTION_CORRELATION_WEAK = 0.5
CONTRIBUTION_CORRELATION_UNIDENTIFIED = 0.7

# (p97 - p3) / (2 * |p50|). Above the second threshold the interval is wider than the
# estimate itself.
RELATIVE_WIDTH_WEAK = 1.0
RELATIVE_WIDTH_UNIDENTIFIED = 2.0

# Relative movement of a channel's contribution share when every prior is doubled in
# width. Above the second threshold the answer is the prior's, not the data's.
PRIOR_SENSITIVITY_WEAK = 0.25
PRIOR_SENSITIVITY_UNIDENTIFIED = 0.5

IDENTIFIED = "identified"
WEAK = "weak"
NOT_IDENTIFIED = "not_identified"

_RANK = {IDENTIFIED: 0, WEAK: 1, NOT_IDENTIFIED: 2}


def _worst(*verdicts: str) -> str:
    return max(verdicts, key=lambda v: _RANK[v])


def overlap_coefficient(a: np.ndarray, b: np.ndarray, *, bins: int = 80) -> float:
    """Overlapping index of two sample sets: the shared area of their densities, in [0, 1].

    1.0 means the two distributions are indistinguishable; 0.0 means they are disjoint.
    Histogram-based on a shared grid, so it needs no density estimator and no scipy, and
    degrades gracefully on skewed samples (which every HalfNormal posterior is).
    """
    a = np.asarray(a, dtype=float).ravel()
    b = np.asarray(b, dtype=float).ravel()
    a = a[np.isfinite(a)]
    b = b[np.isfinite(b)]
    if a.size == 0 or b.size == 0:
        return float("nan")
    lo = min(a.min(), b.min())
    hi = max(a.max(), b.max())
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        return 1.0
    edges = np.linspace(lo, hi, bins + 1)
    width = edges[1] - edges[0]
    pa, _ = np.histogram(a, bins=edges, density=True)
    pb, _ = np.histogram(b, bins=edges, density=True)
    return float(np.sum(np.minimum(pa, pb)) * width)


def relative_interval_width(samples: np.ndarray) -> float:
    """Half the 94% interval, relative to the median. ``inf`` when the median is ~0."""
    samples = np.asarray(samples, dtype=float).ravel()
    lo, mid, hi = np.percentile(samples, [3.0, 50.0, 97.0])
    if abs(mid) < 1e-12:
        return float("inf")
    return float((hi - lo) / (2.0 * abs(mid)))


def contribution_correlations(contributions: dict[str, np.ndarray]) -> dict[tuple[str, str], float]:
    """Pearson correlation between every pair of channels' total posterior contributions.

    A strongly negative correlation is the classic signature of two channels the data
    cannot separate: every draw that gives more to one gives correspondingly less to the
    other, and the fit is equally good either way. The sign does not matter for the
    diagnosis, only the magnitude.
    """
    names = list(contributions)
    out: dict[tuple[str, str], float] = {}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            xa = np.asarray(contributions[a], dtype=float).ravel()
            xb = np.asarray(contributions[b], dtype=float).ravel()
            if xa.std() < 1e-12 or xb.std() < 1e-12:
                out[(a, b)] = 0.0
                continue
            out[(a, b)] = float(np.corrcoef(xa, xb)[0, 1])
    return out


@dataclass(frozen=True)
class ChannelIdentifiability:
    """Whether one channel's reported effect is a measurement or a restated assumption."""

    name: str
    verdict: str                                  # identified | weak | not_identified
    prior_posterior_overlap: float | None
    max_contribution_correlation: float
    most_correlated_with: str | None
    relative_interval_width: float
    prior_sensitivity: float | None
    reasons: list[str] = field(default_factory=list)

    @property
    def is_usable(self) -> bool:
        """True when this channel's own number may be shown as a per-channel result."""
        return self.verdict != NOT_IDENTIFIED


@dataclass(frozen=True)
class IdentifiabilityReport:
    """Per-channel identifiability plus the groups the model could not separate."""

    channels: tuple[ChannelIdentifiability, ...]
    # Channels whose contributions are so strongly correlated that only their *sum* is
    # identified. Reporting them individually invents a split the data does not support.
    inseparable_groups: tuple[tuple[str, ...], ...] = ()

    def channel(self, name: str) -> ChannelIdentifiability:
        for c in self.channels:
            if c.name == name:
                return c
        raise KeyError(f"no identifiability result for channel {name!r}")

    @property
    def unusable_channels(self) -> list[str]:
        return [c.name for c in self.channels if not c.is_usable]

    @property
    def worst_verdict(self) -> str:
        return _worst(*(c.verdict for c in self.channels)) if self.channels else IDENTIFIED

    def usable_channels_exist(self) -> bool:
        """True when at least one channel's own number is worth reporting."""
        return any(c.is_usable for c in self.channels)


def _group_inseparable(
    names: list[str], correlations: dict[tuple[str, str], float]
) -> tuple[tuple[str, ...], ...]:
    """Union-find over pairs above the hard correlation threshold."""
    parent = {n: n for n in names}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    linked = False
    for (a, b), r in correlations.items():
        if abs(r) >= CONTRIBUTION_CORRELATION_UNIDENTIFIED:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
                linked = True
    if not linked:
        return ()
    groups: dict[str, list[str]] = {}
    for n in names:
        groups.setdefault(find(n), []).append(n)
    return tuple(tuple(g) for g in groups.values() if len(g) > 1)


def assess_identifiability(
    contributions: dict[str, np.ndarray],
    *,
    prior_samples: dict[str, np.ndarray] | None = None,
    posterior_samples: dict[str, np.ndarray] | None = None,
    prior_sensitivity: dict[str, float] | None = None,
) -> IdentifiabilityReport:
    """Judge whether each channel's contribution is something the data actually determined.

    Args:
        contributions: ``{channel: (n_samples,)}`` total posterior contribution per draw.
        prior_samples: ``{channel: (n,)}`` draws from the channel's *prior* effect
            parameter, for the overlap test. Optional — omit and the overlap check is
            skipped rather than guessed.
        posterior_samples: ``{channel: (n,)}`` posterior draws of the same parameter.
        prior_sensitivity: ``{channel: relative shift}`` in contribution share between the
            main fit and a deliberately loosened-prior refit. Optional.
    """
    names = list(contributions)
    correlations = contribution_correlations(contributions)
    results: list[ChannelIdentifiability] = []

    for name in names:
        reasons: list[str] = []
        verdict = IDENTIFIED

        # 1. correlation with the other channels
        partners = [
            (other, r)
            for (a, b), r in correlations.items()
            for other in ([b] if a == name else [a] if b == name else [])
        ]
        if partners:
            worst_partner, worst_r = max(partners, key=lambda p: abs(p[1]))
        else:
            worst_partner, worst_r = None, 0.0
        if abs(worst_r) >= CONTRIBUTION_CORRELATION_UNIDENTIFIED:
            verdict = _worst(verdict, NOT_IDENTIFIED)
            reasons.append(
                f"de bijdrage van dit kanaal en die van {worst_partner!r} zijn niet los van "
                f"elkaar te bepalen (samenhang {worst_r:+.2f}): het model kan de ene omhoog "
                f"en de andere omlaag doen zonder dat de fit slechter wordt"
            )
        elif abs(worst_r) >= CONTRIBUTION_CORRELATION_WEAK:
            verdict = _worst(verdict, WEAK)
            reasons.append(
                f"de bijdrage overlapt sterk met die van {worst_partner!r} "
                f"(samenhang {worst_r:+.2f}); de verdeling tussen die twee is onzeker"
            )

        # 2. width of the interval relative to the estimate
        width = relative_interval_width(contributions[name])
        if width >= RELATIVE_WIDTH_UNIDENTIFIED:
            verdict = _worst(verdict, NOT_IDENTIFIED)
            reasons.append(
                "de onzekerheidsmarge is breder dan de schatting zelf — er valt geen "
                "betrouwbaar getal aan te ontlenen"
            )
        elif width >= RELATIVE_WIDTH_WEAK:
            verdict = _worst(verdict, WEAK)
            reasons.append("brede onzekerheidsmarge rond de bijdrage")

        # 3. did the data move the prior at all?
        overlap = None
        if prior_samples and posterior_samples and name in prior_samples and name in posterior_samples:
            overlap = overlap_coefficient(prior_samples[name], posterior_samples[name])
            if np.isfinite(overlap):
                if overlap >= PRIOR_POSTERIOR_OVERLAP_UNIDENTIFIED:
                    verdict = _worst(verdict, NOT_IDENTIFIED)
                    reasons.append(
                        f"de data heeft de aanname over dit kanaal nauwelijks bijgesteld "
                        f"({overlap:.0%} overlap tussen aanname en uitkomst); het getal dat "
                        f"je ziet komt vrijwel volledig uit de aanname"
                    )
                elif overlap >= PRIOR_POSTERIOR_OVERLAP_WEAK:
                    verdict = _worst(verdict, WEAK)
                    reasons.append(
                        f"de data heeft de aanname maar beperkt bijgesteld "
                        f"({overlap:.0%} overlap)"
                    )

        # 4. does the answer survive looser priors?
        sensitivity = (prior_sensitivity or {}).get(name)
        if sensitivity is not None:
            if sensitivity >= PRIOR_SENSITIVITY_UNIDENTIFIED:
                verdict = _worst(verdict, NOT_IDENTIFIED)
                reasons.append(
                    f"met ruimere aannames verschuift de bijdrage {sensitivity:.0%} — de "
                    f"uitkomst wordt door de aanname bepaald, niet door je data"
                )
            elif sensitivity >= PRIOR_SENSITIVITY_WEAK:
                verdict = _worst(verdict, WEAK)
                reasons.append(
                    f"de bijdrage is gevoelig voor de gekozen aannames ({sensitivity:.0%} "
                    f"verschuiving bij ruimere aannames)"
                )

        results.append(
            ChannelIdentifiability(
                name=name,
                verdict=verdict,
                prior_posterior_overlap=overlap,
                max_contribution_correlation=float(worst_r),
                most_correlated_with=worst_partner,
                relative_interval_width=width,
                prior_sensitivity=sensitivity,
                reasons=reasons,
            )
        )

    return IdentifiabilityReport(
        channels=tuple(results),
        inseparable_groups=_group_inseparable(names, correlations),
    )


def prior_effect_samples(config, n: int = 4000, seed: int = 0) -> dict[str, np.ndarray]:
    """Draw each channel's effect parameter from its *prior*, for the overlap test.

    Sampled analytically from the configured HalfNormal rather than by running PyMC's
    prior-predictive: the parameter's prior is known in closed form, so this costs
    microseconds and needs no model extra.
    """
    rng = np.random.default_rng(seed)
    return {
        ch.name: np.abs(rng.normal(0.0, ch.priors.beta_sigma, n)) for ch in config.channels
    }


def prior_sensitivity_shift(
    base_shares: dict[str, float], widened_shares: dict[str, float]
) -> dict[str, float]:
    """Relative movement of each channel's contribution share between two fits.

    Expressed relative to the larger of the two shares, so a channel going from 2% to 4%
    reads as a 50% shift (which it is) rather than as a negligible two points.
    """
    out: dict[str, float] = {}
    for name, base in base_shares.items():
        if name not in widened_shares:
            continue
        other = widened_shares[name]
        denom = max(abs(base), abs(other))
        out[name] = float(abs(base - other) / denom) if denom > 1e-12 else 0.0
    return out
