"""Hierarchical (geo / multi-region) MMM with partial pooling.

When a client advertises across regions, countries or business units, fitting each one
in isolation wastes data and gives noisy per-region estimates; pooling them all into one
average hides real differences. A *hierarchical* model does the honest middle thing: each
region gets its own channel effect, but those effects are drawn from a shared
distribution, so regions borrow statistical strength from one another (partial pooling).
Small regions are pulled toward the group; large ones speak for themselves.

Design (deliberately a self-contained addition — the single-region pipeline is unchanged):
  * The **magnitude** of each channel varies by region: a non-centred, non-negative
    per-region ``beta_{c,r}`` drawn from a channel-level hyper-distribution.
  * The **shape** of each channel (adstock + saturation) is pooled — one set of params
    shared across regions, since carry-over/curvature are properties of the channel, not
    the region. This keeps the model identifiable with a handful of regions.
  * Baseline: a partially-pooled per-region intercept; trend, seasonality and controls
    are shared across regions (common time dynamics). Normal likelihood.

Reuses the frozen transforms from :mod:`mmm_core.model.build`, so the maths is identical
to the single-region model — only the parameter hierarchy is new.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from mmm_core.model.build import (
    _adstock_rvs,
    _fourier_features,
    _saturation_rvs,
)
from mmm_core.model.config import ModelConfig
from mmm_core.model.fit import Interval
from mmm_core.model.validation import check_decomposition_adds_up


@dataclass
class HierBuiltModel:
    model: object
    config: ModelConfig
    regions: list[str]
    dates: pd.DatetimeIndex
    y_max: dict[str, float]            # per-region KPI scaler
    x_max: np.ndarray                  # per-channel global spend scaler
    kpi: dict[str, np.ndarray]         # per-region KPI (original units)
    spend: dict[str, np.ndarray]       # per-region (T, C) spend (original units)


@dataclass
class HierChannelResult:
    name: str
    global_contribution_share: Interval          # across all regions
    global_roas: Interval
    per_region_share: dict[str, Interval]        # region -> contribution share in that region


@dataclass
class HierDiagnostics:
    max_r_hat: float
    n_divergences: int
    r2_pooled: float
    decomposition_ok: bool


@dataclass
class HierSummary:
    kpi: str
    regions: list[str]
    n_weeks: int
    channels: list[HierChannelResult]
    diagnostics: HierDiagnostics

    def to_json_dict(self) -> dict:
        from mmm_core.model.fit import _to_plain
        from dataclasses import asdict

        return _to_plain(asdict(self))


def _validate(region_frames: dict[str, pd.DataFrame], config: ModelConfig) -> pd.DatetimeIndex:
    if len(region_frames) < 2:
        raise ValueError("a hierarchical model needs at least two regions")
    needed = [config.kpi, *config.channel_names, *config.control_columns]
    index = None
    for region, df in region_frames.items():
        for col in needed:
            if col not in df.columns:
                raise KeyError(f"region {region!r} is missing column {col!r}")
        if not np.isfinite(df[needed].to_numpy(dtype=float)).all():
            raise ValueError(f"region {region!r} has missing/non-finite values in a modelled column")
        if index is None:
            index = df.index
        elif not df.index.equals(index):
            raise ValueError("all regions must share the same weekly index (aligned weeks)")
    return index


def build_hierarchical_model(region_frames: dict[str, pd.DataFrame], config: ModelConfig) -> HierBuiltModel:
    """Construct the partially-pooled multi-region PyMC model."""
    import pymc as pm
    import pytensor.tensor as pt

    dates = _validate(region_frames, config)
    regions = list(region_frames)
    n = len(dates)
    if n < 2:
        raise ValueError("need at least two weeks of data")
    channels = config.channels
    C = len(channels)

    # Per-region KPI scaler; per-channel *global* spend scaler (so betas are comparable).
    kpi = {r: region_frames[r][config.kpi].to_numpy(dtype=float) for r in regions}
    y_max = {r: float(kpi[r].max()) or 1.0 for r in regions}
    spend = {
        r: np.column_stack([region_frames[r][c.name].to_numpy(dtype=float) for c in channels])
        for r in regions
    }
    x_max = np.array([max(spend[r][:, i].max() for r in regions) for i in range(C)], dtype=float)
    x_max_safe = np.where(x_max > 0, x_max, 1.0)

    t = np.arange(n, dtype=float)
    t_scaled = t / (n - 1)
    bp = config.priors
    all_scaled_median = float(np.median(np.concatenate([kpi[r] / y_max[r] for r in regions])))

    coords = {"region": regions, "channel": list(config.channel_names), "date": dates}
    with pm.Model(coords=coords) as model:
        # Shared time dynamics across regions.
        mu_time = pt.zeros(n)
        if config.add_trend:
            trend = pm.Normal("trend", mu=0.0, sigma=bp.trend_sigma)
            mu_time = mu_time + trend * t_scaled
        if config.seasonality_periods and config.n_fourier_modes > 0:
            fourier = _fourier_features(t, config.seasonality_periods, config.n_fourier_modes)
            season = pm.Normal("season", mu=0.0, sigma=bp.season_sigma, shape=fourier.shape[1])
            mu_time = mu_time + pt.dot(fourier, season)
        control_coef = {
            ctrl: pm.Normal(f"control_{ctrl}", mu=0.0, sigma=bp.control_sigma)
            for ctrl in config.control_columns
        }

        # Partially-pooled per-region intercept (non-centred).
        mu_int = pm.Normal("intercept_mu", mu=all_scaled_median, sigma=bp.intercept_sigma)
        sigma_int = pm.HalfNormal("intercept_sigma", sigma=0.25)
        z_int = pm.Normal("intercept_z", mu=0.0, sigma=1.0, dims="region")
        intercept = pm.Deterministic("intercept", mu_int + z_int * sigma_int, dims="region")

        # Per channel: pooled shape (adstock+saturation) and hierarchical per-region beta.
        apply_adstock = {}
        apply_sat = {}
        beta = {}
        for c in channels:
            apply_adstock[c.name], _ = _adstock_rvs(pm, c)
            apply_sat[c.name], _ = _saturation_rvs(pm, c)
            log_mu = pm.Normal(f"beta_logmu_{c.name}", mu=float(np.log(0.3)), sigma=0.7)
            tau = pm.HalfNormal(f"beta_tau_{c.name}", sigma=0.5)
            z = pm.Normal(f"beta_z_{c.name}", mu=0.0, sigma=1.0, dims="region")
            beta[c.name] = pm.Deterministic(
                f"beta_{c.name}", pt.exp(log_mu + z * tau), dims="region"
            )

        mus = []
        y_obs = []
        for ri, r in enumerate(regions):
            mu_r = intercept[ri] + mu_time
            for ctrl in config.control_columns:
                raw = region_frames[r][ctrl].to_numpy(dtype=float)
                std = raw.std() or 1.0
                mu_r = mu_r + control_coef[ctrl] * ((raw - raw.mean()) / std)
            for i, c in enumerate(channels):
                x_scaled = pt.as_tensor_variable(spend[r][:, i] / x_max_safe[i])
                saturated = apply_sat[c.name](apply_adstock[c.name](x_scaled))
                contribution = pm.Deterministic(
                    f"contrib_{c.name}_{r}", beta[c.name][ri] * saturated, dims="date"
                )
                mu_r = mu_r + contribution
            pm.Deterministic(f"mu_{r}", mu_r, dims="date")
            mus.append(mu_r)
            y_obs.append(kpi[r] / y_max[r])

        mu_stacked = pt.concatenate(mus)
        y_stacked = np.concatenate(y_obs)
        sigma = pm.HalfNormal("sigma", sigma=bp.noise_sigma)
        pm.Normal("y", mu=mu_stacked, sigma=sigma, observed=y_stacked)

    return HierBuiltModel(
        model=model, config=config, regions=regions, dates=dates,
        y_max=y_max, x_max=x_max_safe, kpi=kpi, spend=spend,
    )


def _flat(idata, name: str) -> np.ndarray:
    return idata.posterior[name].stack(sample=("chain", "draw")).to_numpy()


def summarize_hierarchical(built: HierBuiltModel, idata) -> HierSummary:
    """Per-region and pooled (global) attribution for the hierarchical fit."""
    import arviz as az

    config = built.config
    regions = built.regions
    kpi_total_global = float(sum(built.kpi[r].sum() for r in regions))

    channels: list[HierChannelResult] = []
    # accumulate for pooled r2 / decomposition
    per_region_pred_mean = {r: None for r in regions}

    for i, ch in enumerate(config.channels):
        global_contrib = None
        spend_global = float(sum(built.spend[r][:, i].sum() for r in regions))
        per_region_share: dict[str, Interval] = {}
        for r in regions:
            contrib = _flat(idata, f"contrib_{ch.name}_{r}")          # (T, S) scaled
            contrib_total = contrib.sum(axis=0) * built.y_max[r]      # (S,) KPI units
            region_kpi_total = float(built.kpi[r].sum()) or 1.0
            per_region_share[r] = Interval.from_samples(contrib_total / region_kpi_total)
            global_contrib = contrib_total if global_contrib is None else global_contrib + contrib_total
        channels.append(
            HierChannelResult(
                name=ch.name,
                global_contribution_share=Interval.from_samples(global_contrib / kpi_total_global),
                global_roas=Interval.from_samples(
                    global_contrib / spend_global if spend_global else global_contrib * np.nan
                ),
                per_region_share=per_region_share,
            )
        )

    # Pooled diagnostics from each region's fitted linear predictor (the mu_{r} Deterministic).
    actual, predicted = [], []
    decomp_components_ok = True
    for r in regions:
        mu_r = _flat(idata, f"mu_{r}").mean(axis=1)             # (T,) scaled posterior mean
        predicted.append(mu_r * built.y_max[r])
        actual.append(built.kpi[r])
        contribs_mean = {
            ch.name: _flat(idata, f"contrib_{ch.name}_{r}").mean(axis=1) for ch in config.channels
        }
        comp = dict(contribs_mean)
        comp["baseline"] = mu_r - sum(contribs_mean.values())
        if not check_decomposition_adds_up(mu_r, comp).ok:
            decomp_components_ok = False

    actual = np.concatenate(actual)
    predicted = np.concatenate(predicted)
    ss_res = float(np.sum((actual - predicted) ** 2))
    ss_tot = float(np.sum((actual - actual.mean()) ** 2)) or 1.0
    r2 = 1.0 - ss_res / ss_tot

    var_names = ["intercept_mu", "sigma"] + [f"beta_logmu_{c.name}" for c in config.channels]
    summ = az.summary(idata, var_names=var_names)
    diagnostics = HierDiagnostics(
        max_r_hat=float(summ["r_hat"].max()),
        n_divergences=int(idata.sample_stats["diverging"].to_numpy().sum()),
        r2_pooled=r2,
        decomposition_ok=decomp_components_ok,
    )

    return HierSummary(
        kpi=config.kpi,
        regions=regions,
        n_weeks=len(built.dates),
        channels=channels,
        diagnostics=diagnostics,
    )


def fit_hierarchical(
    region_frames: dict[str, pd.DataFrame],
    config: ModelConfig,
    *,
    draws: int = 1000,
    tune: int = 1000,
    chains: int = 4,
    target_accept: float = 0.95,
    seed: int = 0,
    progressbar: bool = False,
):
    """Build, sample (numpyro NUTS) and summarize the hierarchical model."""
    import pymc as pm

    built = build_hierarchical_model(region_frames, config)
    with built.model:
        idata = pm.sample(
            draws=draws, tune=tune, chains=chains, target_accept=target_accept,
            nuts_sampler="numpyro", random_seed=seed, progressbar=progressbar,
        )
    return summarize_hierarchical(built, idata), idata
