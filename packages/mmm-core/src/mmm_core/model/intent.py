"""Model *intent*: the closed vocabulary a human or an AI is allowed to speak.

This module exists to draw one hard line. An LLM is good at reading a conversation and
concluding "TV is a brand channel that keeps working for a while and we spend a lot on
it". It is not good — and must never be trusted — at turning that into
``beta_sigma = 0.34``, because the right number depends on the number of channels, the
scale of the KPI, and the spend distribution, none of which a language model measures.

So the AI produces a :class:`ModelIntent`: an ordinal, enumerated statement of belief with
no free numbers in it at all. :mod:`mmm_core.model.priors` then combines that intent with
measured statistics of the actual dataset (:mod:`mmm_core.model.datastats`) to produce the
:class:`~mmm_core.model.config.ModelConfig` the sampler runs on.

The practical consequences:

* A malformed or adversarial LLM response can pick the *wrong* enum value. It cannot pick
  a value that makes the model numerically absurd, because there are no numbers to pick.
* Every prior is reproducible: same intent + same dataset = same priors, forever.
* Every prior is explainable in the user's own words, because it is derived from a
  sentence the user recognises ("you said TV keeps working for a long time").

The only escape hatch is :class:`~mmm_core.model.config.RoasCalibration`, which carries
real measured numbers — and which is therefore gated on an explicitly recorded experiment
rather than on anything a model inferred.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from mmm_core.model.config import ChannelUnit, KpiType


class Carryover(str, Enum):
    """How long a channel keeps working after the money is spent."""

    NONE = "none"        # effect lands entirely in the same week (~0.5wk half-life)
    SHORT = "short"      # a week or so  (search, marketplaces, retargeting)
    MEDIUM = "medium"    # a few weeks   (paid social, video)
    LONG = "long"        # over a month  (TV, radio, OOH, brand campaigns)
    UNKNOWN = "unknown"  # let the data decide, wide prior


class Strength(str, Enum):
    """How large an effect the user expects this channel to have, relative to the others."""

    SMALL = "small"
    MODERATE = "moderate"
    LARGE = "large"
    UNKNOWN = "unknown"


class SaturationBelief(str, Enum):
    """Whether the channel is thought to be running into diminishing returns yet."""

    FAR_FROM_SATURATED = "far_from_saturated"  # more budget would still work well
    APPROACHING = "approaching"                # starting to flatten
    LIKELY_SATURATED = "likely_saturated"      # extra budget mostly wasted
    UNKNOWN = "unknown"


class SeasonalityBelief(str, Enum):
    """How strongly the KPI swings with the calendar, independent of marketing."""

    NONE = "none"
    MILD = "mild"
    STRONG = "strong"
    UNKNOWN = "unknown"


class ChannelRole(str, Enum):
    """What the channel is for. Picks the carry-over *shape*, not its length."""

    DEMAND_CAPTURE = "demand_capture"    # harvests existing intent -> geometric adstock
    BRAND_BUILDING = "brand_building"    # creates future demand -> delayed (peaked) adstock
    MIXED = "mixed"


# Prior-centre half-life in weeks per carry-over class. These are the *only* numbers in
# the intent layer, and they live here (not in the prompt) precisely so a model cannot
# move them.
_HALF_LIFE_WEEKS: dict[Carryover, float] = {
    Carryover.NONE: 0.5,
    Carryover.SHORT: 1.0,
    Carryover.MEDIUM: 2.5,
    Carryover.LONG: 5.0,
    Carryover.UNKNOWN: 2.5,
}

# How tightly the half-life prior is pinned. "unknown" deliberately gets a much lower
# concentration so the data, not the guess, decides.
_ADSTOCK_CONCENTRATION: dict[Carryover, float] = {
    Carryover.NONE: 25.0,
    Carryover.SHORT: 20.0,
    Carryover.MEDIUM: 20.0,
    Carryover.LONG: 15.0,
    Carryover.UNKNOWN: 6.0,
}

# Relative weight in the model's total prior media budget. A "large" channel gets four
# times the prior effect of a "small" one; the weights are normalised across channels, so
# adding a channel never inflates the total.
_STRENGTH_WEIGHT: dict[Strength, float] = {
    Strength.SMALL: 0.5,
    Strength.MODERATE: 1.0,
    Strength.LARGE: 2.0,
    Strength.UNKNOWN: 1.0,
}

# Multiplier on the half-saturation point, expressed relative to the channel's own median
# weekly pressure. >1 means "half-saturation is reached above the typical spend", i.e. the
# channel still has room; <1 means it saturates below typical spend.
_SATURATION_CENTER: dict[SaturationBelief, float] = {
    SaturationBelief.FAR_FROM_SATURATED: 3.0,
    SaturationBelief.APPROACHING: 1.0,
    SaturationBelief.LIKELY_SATURATED: 0.4,
    SaturationBelief.UNKNOWN: 1.3,
}

# Log-scale spread of that LogNormal. "unknown" is wider on purpose.
_SATURATION_SIGMA: dict[SaturationBelief, float] = {
    SaturationBelief.FAR_FROM_SATURATED: 0.6,
    SaturationBelief.APPROACHING: 0.6,
    SaturationBelief.LIKELY_SATURATED: 0.6,
    SaturationBelief.UNKNOWN: 0.9,
}

# Multiplier on the seasonal amplitude *measured in the data*. The measurement sets the
# scale; the belief only widens or narrows the room around it.
_SEASON_MULTIPLIER: dict[SeasonalityBelief, float] = {
    SeasonalityBelief.NONE: 0.0,
    SeasonalityBelief.MILD: 1.5,
    SeasonalityBelief.STRONG: 3.0,
    SeasonalityBelief.UNKNOWN: 2.0,
}


def half_life_for(carryover: Carryover) -> float:
    return _HALF_LIFE_WEEKS[carryover]


def adstock_concentration_for(carryover: Carryover) -> float:
    return _ADSTOCK_CONCENTRATION[carryover]


def strength_weight_for(strength: Strength) -> float:
    return _STRENGTH_WEIGHT[strength]


def saturation_center_for(belief: SaturationBelief) -> float:
    return _SATURATION_CENTER[belief]


def saturation_sigma_for(belief: SaturationBelief) -> float:
    return _SATURATION_SIGMA[belief]


def season_multiplier_for(belief: SeasonalityBelief) -> float:
    return _SEASON_MULTIPLIER[belief]


@dataclass(frozen=True)
class ChannelIntent:
    """What is believed about one channel, in words rather than numbers.

    Args:
        name: The column in the master dataset.
        unit: What that column measures. Required — there is no safe default, because
            treating impressions as euros silently corrupts every ROAS and the whole
            budget optimisation.
        role: What the channel is for; picks geometric vs. delayed carry-over.
        carryover: How long it keeps working.
        strength: Expected size relative to the other channels.
        saturation: Whether it is thought to be running into diminishing returns.
    """

    name: str
    unit: ChannelUnit
    role: ChannelRole = ChannelRole.MIXED
    carryover: Carryover = Carryover.UNKNOWN
    strength: Strength = Strength.UNKNOWN
    saturation: SaturationBelief = SaturationBelief.UNKNOWN

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("a channel intent needs a column name")


@dataclass(frozen=True)
class ModelIntent:
    """The complete, number-free statement of what the model should assume.

    Args:
        kpi: The target column.
        kpi_type: What it counts (fixes the likelihood family).
        channels: One :class:`ChannelIntent` per media channel.
        control_columns: Exogenous controls entered linearly.
        seasonality: How strongly the KPI swings with the calendar.
        expect_trend: Whether the baseline is expected to drift over the window.
        expect_structural_break: Whether a discrete level/slope break is expected
            (switches the trend to piecewise).
        media_share_belief: Optional prior belief about what fraction of the KPI marketing
            drives in total, as an ordinal band. ``None`` uses the neutral default. This is
            the single most consequential prior in an MMM, so it is stated explicitly
            rather than emerging by accident from the number of channels.
    """

    kpi: str
    kpi_type: KpiType
    channels: tuple[ChannelIntent, ...]
    control_columns: tuple[str, ...] = ()
    seasonality: SeasonalityBelief = SeasonalityBelief.UNKNOWN
    expect_trend: bool = True
    expect_structural_break: bool = False
    media_share_belief: "MediaShare | None" = None
    notes: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if not self.kpi:
            raise ValueError("a model intent needs a KPI column")
        if not self.channels:
            raise ValueError("a model intent needs at least one channel")
        names = [c.name for c in self.channels]
        if len(names) != len(set(names)):
            raise ValueError("channel names must be unique")

    @property
    def channel_names(self) -> list[str]:
        return [c.name for c in self.channels]


class MediaShare(str, Enum):
    """How much of the KPI marketing is believed to drive in total.

    The prior centre for the sum of all channel contributions. Most businesses with a
    meaningful baseline sit at ``MODERATE``; a pure-performance startup with no organic
    demand sits at ``DOMINANT``; an established brand where advertising is a top-up sits
    at ``SMALL``.
    """

    SMALL = "small"          # ~15% of the KPI
    MODERATE = "moderate"    # ~30% (default)
    LARGE = "large"          # ~50%
    DOMINANT = "dominant"    # ~70%


_MEDIA_SHARE_CENTER: dict[MediaShare, float] = {
    MediaShare.SMALL: 0.15,
    MediaShare.MODERATE: 0.30,
    MediaShare.LARGE: 0.50,
    MediaShare.DOMINANT: 0.70,
}

DEFAULT_MEDIA_SHARE = MediaShare.MODERATE


def media_share_center(belief: "MediaShare | None") -> float:
    """Prior centre for the total media share of the KPI."""
    return _MEDIA_SHARE_CENTER[belief or DEFAULT_MEDIA_SHARE]
