"""Model evaluation: is the fit *reliable*, not just well-fitting in-sample?

Four independent checks, each answering a question the in-sample R² cannot:

  1. **Time-series cross-validation** — fit on the past, predict the near future,
     score out of sample. The honest test of whether the model generalizes or overfits.
  2. **Placebo test** — add a channel of pure random "spend"; a trustworthy model gives
     it ~zero contribution. A large placebo contribution means the model is
     over-attributing noise.
  3. **Prior-predictive check** — before looking at the KPI, do the priors imply a
     plausible KPI range? If not, the priors are fighting the data.
  4. **Model comparison** — rank competing configs by out-of-sample predictive density
     (ArviZ LOO), so a choice between two setups is data-driven, not a guess.

The cross-validation and placebo *logic* is pure numpy/pandas and unit-tested with
stubs; the paths that actually sample (prior-predictive, LOO) import PyMC lazily and are
smoke-tested under the model extra.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
import pandas as pd

from mmm_core.model.config import ChannelConfig, ChannelType, ModelConfig
from mmm_core.model.validation import CheckResult


# --- 1. time-series cross-validation ---------------------------------------------

@dataclass(frozen=True)
class FoldResult:
    train_weeks: int
    test_weeks: int
    r2: float
    mape: float


@dataclass(frozen=True)
class CVResult:
    folds: list[FoldResult]
    mean_r2: float
    mean_mape: float


def expanding_splits(n: int, min_train_weeks: int, horizon: int, step: int | None = None) -> list[int]:
    """Expanding-origin split points: each ``train_end`` uses weeks ``[0:train_end]`` for
    training and ``[train_end:train_end+horizon]`` for testing."""
    if min_train_weeks < 2:
        raise ValueError("min_train_weeks must be >= 2")
    if horizon < 1:
        raise ValueError("horizon must be >= 1")
    step = step or horizon
    if step < 1:
        raise ValueError("step must be >= 1")
    ends = []
    train_end = min_train_weeks
    while train_end + horizon <= n:
        ends.append(train_end)
        train_end += step
    return ends


def _score(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, float]:
    resid = y_true - y_pred
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2)) or 1.0
    r2 = 1.0 - ss_res / ss_tot
    denom = np.where(y_true != 0, np.abs(y_true), np.nan)
    mape = float(np.nanmean(np.abs(resid) / denom))
    return r2, mape


def _default_fit_fn(train_data, config, **sample_kwargs):
    from mmm_core.model.build import build_model
    import pymc as pm

    built = build_model(train_data, config)
    with built.model:
        idata = pm.sample(nuts_sampler="numpyro", progressbar=False, **sample_kwargs)
    return built, idata


def _default_predict_fn(handle, full_data):
    from mmm_core.model.predict import posterior_predict

    built, idata = handle
    return posterior_predict(built, idata, full_data)["kpi"]  # (T, S)


def time_series_cv(
    data: pd.DataFrame,
    config: ModelConfig,
    *,
    min_train_weeks: int = 52,
    horizon: int = 8,
    step: int | None = None,
    fit_fn=None,
    predict_fn=None,
    sample_kwargs: dict | None = None,
) -> CVResult:
    """Expanding-origin cross-validation with out-of-sample R²/MAPE per fold.

    ``fit_fn(train_data, config, **sample_kwargs) -> handle`` and
    ``predict_fn(handle, full_data) -> predictions`` are injectable (predictions may be
    ``(T, S)`` posterior samples or a ``(T,)`` point series). The defaults fit the real
    PyMC model and reconstruct predictions from the posterior.
    """
    fit_fn = fit_fn or _default_fit_fn
    predict_fn = predict_fn or _default_predict_fn
    sample_kwargs = sample_kwargs or {}
    kpi = data[config.kpi].to_numpy(dtype=float)

    ends = expanding_splits(len(data), min_train_weeks, horizon, step)
    if not ends:
        raise ValueError("no CV folds: need min_train_weeks + horizon <= number of weeks")

    folds: list[FoldResult] = []
    for train_end in ends:
        train = data.iloc[:train_end]
        full = data.iloc[: train_end + horizon]
        handle = fit_fn(train, config, **sample_kwargs)
        pred = np.asarray(predict_fn(handle, full))
        pred_mean = pred.mean(axis=1) if pred.ndim == 2 else pred
        y_true = kpi[train_end : train_end + horizon]
        y_pred = pred_mean[train_end : train_end + horizon]
        r2, mape = _score(y_true, y_pred)
        folds.append(FoldResult(train_weeks=train_end, test_weeks=len(y_true), r2=r2, mape=mape))

    mean_r2 = float(np.mean([f.r2 for f in folds]))
    mean_mape = float(np.mean([f.mape for f in folds]))
    return CVResult(folds=folds, mean_r2=mean_r2, mean_mape=mean_mape)


# --- 2. placebo test -------------------------------------------------------------

def add_placebo_channel(
    data: pd.DataFrame,
    config: ModelConfig,
    *,
    name: str = "placebo_random",
    seed: int = 0,
    channel_type: ChannelType = ChannelType.GENERIC,
) -> tuple[pd.DataFrame, ModelConfig]:
    """Return ``(data, config)`` augmented with a channel of random, KPI-independent
    "spend". Fit the result: a trustworthy model attributes ~nothing to it."""
    if name in data.columns:
        raise ValueError(f"column {name!r} already exists")
    rng = np.random.default_rng(seed)
    # Match the scale of the real channels so the placebo isn't trivially ignorable.
    ref = np.median([data[c.name].mean() for c in config.channels]) if config.channels else 1.0
    spend = rng.uniform(0.0, 2.0 * max(ref, 1e-6), len(data))
    data2 = data.copy()
    data2[name] = spend
    config2 = replace(config, channels=config.channels + (ChannelConfig(name, channel_type),))
    return data2, config2


def judge_placebo(summary, placebo_name: str, *, share_threshold: float = 0.05) -> CheckResult:
    """Check that the placebo channel's contribution share is negligible."""
    match = [c for c in summary.channels if c.name == placebo_name]
    if not match:
        raise ValueError(f"placebo channel {placebo_name!r} not in summary")
    share = float(match[0].contribution_share.p50)
    ok = abs(share) <= share_threshold
    return CheckResult(
        ok=ok,
        detail=f"placebo contribution share {share:.1%} (threshold {share_threshold:.0%})",
        value=share,
    )


# --- 3. prior-predictive check ---------------------------------------------------

@dataclass(frozen=True)
class PriorPredictiveResult:
    observed_low: float
    observed_high: float
    prior_low: float          # 0.5th percentile of prior-predictive KPI
    prior_high: float         # 99.5th percentile
    admits_observed: bool     # prior range covers the observed KPI range
    not_absurdly_wide: bool   # prior range not >20x the observed range
    ok: bool


def prior_predictive_check(
    data: pd.DataFrame, config: ModelConfig, *, draws: int = 300, seed: int = 0
) -> PriorPredictiveResult:
    """Sample the KPI implied by the priors alone and compare it to the observed range."""
    import pymc as pm

    from mmm_core.model.build import build_model

    built = build_model(data, config)
    y_max = float(built.scalers["y_max"])
    with built.model:
        idata = pm.sample_prior_predictive(draws=draws, random_seed=seed)
    y_prior = idata.prior_predictive["y"].to_numpy().reshape(-1) * y_max

    observed = data[config.kpi].to_numpy(dtype=float)
    obs_low, obs_high = float(observed.min()), float(observed.max())
    prior_low, prior_high = float(np.percentile(y_prior, 0.5)), float(np.percentile(y_prior, 99.5))

    admits = prior_low <= obs_low and prior_high >= obs_high
    obs_range = max(obs_high - obs_low, 1e-9)
    not_wide = (prior_high - prior_low) <= 20.0 * obs_range
    return PriorPredictiveResult(
        observed_low=obs_low,
        observed_high=obs_high,
        prior_low=prior_low,
        prior_high=prior_high,
        admits_observed=admits,
        not_absurdly_wide=not_wide,
        ok=admits and not_wide,
    )


# --- 4. model comparison (LOO) ---------------------------------------------------

def compare_models(named: dict[str, tuple]) -> "pd.DataFrame":
    """Rank fitted models by out-of-sample predictive density (ArviZ LOO).

    ``named`` maps a label to ``(BuiltModel, InferenceData)``. Computes the pointwise
    log-likelihood where missing (so it works on numpyro traces), then returns the
    ArviZ comparison table — the best model is the top row.
    """
    import arviz as az
    import pymc as pm

    prepared = {}
    for label, (built, idata) in named.items():
        if "log_likelihood" not in idata.groups():
            with built.model:
                pm.compute_log_likelihood(idata, progressbar=False)
        prepared[label] = idata
    return az.compare(prepared)
