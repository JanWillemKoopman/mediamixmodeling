"""Run a prior-predictive review BEFORE spending a full fit.

This is the cheap "contra-expertise vóór de fit" step: given the same job config the fit
would use, it builds the master table and asks mmm-core what KPI range the *priors alone*
imply — no MCMC sampling, just a prior-predictive draw. If that range doesn't admit the
observed KPI (priors too tight) or is absurdly wide (priors uninformative), the architect
can fix the config before Modal compute is spent on a doomed fit.

Like :mod:`mmm_worker.runner`/:mod:`mmm_worker.prepare` it depends only on the
:mod:`mmm_worker.ports` interfaces, so it is unit-tested with in-memory fakes and a stub
check function (the real check pulls in the heavy PyMC stack).
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass

from mmm_core import build_master_dataset

from mmm_worker.jobspec import parse_job_config, source_transforms_map
from mmm_worker.ports import JobStore, Storage
from mmm_worker.tables import read_table


def _review_to_json(result) -> dict:
    """PriorPredictiveResult (dataclass) -> plain JSON-safe dict."""
    if is_dataclass(result) and not isinstance(result, type):
        return {k: (bool(v) if isinstance(v, bool) else float(v) if isinstance(v, (int, float)) else v)
                for k, v in asdict(result).items()}
    if isinstance(result, dict):
        return result
    raise TypeError(f"unexpected prior-predictive result type: {type(result)!r}")


def run_prior_predictive(
    jobstore: JobStore,
    storage: Storage,
    job_id: str,
    *,
    check_fn=None,
) -> dict:
    """Run one prior-predictive review job end-to-end. Never raises for handled failures —
    the job row is marked failed and the reason returned. ``check_fn`` is injectable so
    tests can stub the (heavy) PyMC-backed check."""
    if check_fn is None:
        # Imported lazily so the heavy model stack is only required when actually checking.
        from mmm_core.evaluation import prior_predictive_check as check_fn  # type: ignore

    job = jobstore.get_job(job_id)
    jobstore.mark_running(job_id)

    try:
        spec = parse_job_config(job["config"])
    except Exception as exc:  # malformed config is a permanent failure
        jobstore.mark_failed(job_id, f"invalid job config: {exc}")
        return {"status": "failed", "reason": "invalid_config", "error": str(exc)}

    try:
        frames = []
        for ref in spec.sources:
            raw = storage.download(ref.storage_path)
            frames.append((ref.spec, read_table(ref.storage_path, raw)))

        build = build_master_dataset(
            frames,
            event_dummies=list(spec.event_dummies),
            features=list(spec.features),
            source_transforms=source_transforms_map(spec.sources),
        )
        if build.report.has_errors:
            reason = "; ".join(i.message for i in build.report.errors)
            jobstore.mark_failed(job_id, f"data quality errors: {reason}")
            return {"status": "failed", "reason": "data_quality", "error": reason}

        result = check_fn(build.data, spec.model)
        review = _review_to_json(result)
        jobstore.save_prior_predictive(job_id, review)
        jobstore.mark_succeeded(job_id)
        return {"status": "succeeded", "review": review}

    except Exception as exc:
        jobstore.mark_failed(job_id, f"{type(exc).__name__}: {exc}")
        return {"status": "failed", "reason": "exception", "error": str(exc)}
