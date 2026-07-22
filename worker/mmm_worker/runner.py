"""Orchestrate one fit job: download sources -> align -> fit -> persist.

This is the whole point of the async worker: a fit can take minutes, so it runs here on
Modal without any request-path time limit. The function is pure of Supabase/Modal — it
talks only to the :mod:`mmm_worker.ports` interfaces — so it is unit-tested with fakes.

The split the architecture asks for is enforced here: the small aggregated ``summary``
JSON goes to Postgres (via ``save_model_run``); the heavy raw ``InferenceData`` is
uploaded to Storage as a compressed ``.nc`` and only referenced by path.
"""

from __future__ import annotations

import os
import tempfile

from mmm_core import build_master_dataset, build_master_datasets_by_region

from mmm_worker.jobspec import parse_hier_job_config, parse_job_config, source_transforms_map
from mmm_worker.ports import JobStore, Storage
from mmm_worker.tables import read_table


def _default_netcdf_bytes(idata) -> bytes:
    """Serialize ArviZ InferenceData to netCDF bytes via a temp file."""
    fd, path = tempfile.mkstemp(suffix=".nc")
    os.close(fd)
    try:
        idata.to_netcdf(path)
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        os.unlink(path)


def _run_extra_evaluations(data, model_config, summary, evaluation):
    """Run the opt-in cross-validation/placebo checks and fold the result into the gate.

    Each is its own extra fit (or several, for CV folds), so this deliberately uses a
    lighter sampling budget than the main fit — good enough to judge reliability, not a
    second full result. Never lets an evaluation failure take down an otherwise-good main
    fit: any exception here just means that particular check is skipped.
    """
    from mmm_core.evaluation import add_placebo_channel, judge_placebo, time_series_cv
    from mmm_core.model.fit import fit_model, recompute_quality_gate

    light_sample = {"draws": 500, "tune": 500, "chains": 2}
    placebo_ok = None
    cv_mape = None

    if evaluation.cross_validation:
        try:
            n = len(data)
            horizon = max(2, min(8, n // 10))
            min_train = max(8, int(n * 0.6))
            if min_train + horizon <= n:
                cv_result = time_series_cv(
                    data, model_config,
                    min_train_weeks=min_train, horizon=horizon,
                    sample_kwargs=light_sample,
                )
                cv_mape = cv_result.mean_mape
            # else: too few weeks for even one honest out-of-sample fold — skip rather
            # than force a degenerate split.
        except Exception:
            pass

    if evaluation.placebo:
        try:
            data2, config2 = add_placebo_channel(data, model_config)
            placebo_summary, _ = fit_model(data2, config2, **light_sample)
            placebo_ok = judge_placebo(placebo_summary, "placebo_random").ok
        except Exception:
            pass

    if placebo_ok is None and cv_mape is None:
        return summary
    return recompute_quality_gate(summary, placebo_ok=placebo_ok, cv_mape=cv_mape)


def _quality_to_json(report) -> dict:
    return {
        "issues": [
            {
                "code": i.code,
                "severity": i.severity.value,
                "message": i.message,
                "source": i.source,
                "details": i.details,
            }
            for i in report
        ]
    }


def run_job(
    jobstore: JobStore,
    storage: Storage,
    job_id: str,
    *,
    fit_fn=None,
    evaluate_fn=None,
    netcdf_bytes=_default_netcdf_bytes,
    artifact_prefix: str = "runs",
) -> dict:
    """Run one fit job end-to-end. Returns a small status dict; never raises for
    handled failures (data-quality errors, fit errors) — the job row is marked failed
    and the reason returned."""
    if fit_fn is None:
        # Imported lazily so the heavy model stack is only required when actually fitting.
        from mmm_core.model.fit import fit_model as fit_fn  # type: ignore
    if evaluate_fn is None:
        # Same lazy-import reasoning as fit_fn: _run_extra_evaluations pulls in
        # mmm_core.evaluation/fit_model, which need the heavy model stack to actually run
        # (though not merely to import). Injectable so tests can stub it out.
        evaluate_fn = _run_extra_evaluations

    job = jobstore.get_job(job_id)
    project_id = job["project_id"]
    jobstore.mark_running(job_id)

    try:
        spec = parse_job_config(job["config"])
    except Exception as exc:  # malformed config is a permanent failure
        jobstore.mark_failed(job_id, f"invalid job config: {exc}")
        return {"status": "failed", "reason": "invalid_config", "error": str(exc)}

    try:
        jobstore.update_progress(job_id, "downloading")
        frames = []
        for ref in spec.sources:
            raw = storage.download(ref.storage_path)
            frames.append((ref.spec, read_table(ref.storage_path, raw)))

        jobstore.update_progress(job_id, "building_dataset")
        build = build_master_dataset(
            frames,
            event_dummies=list(spec.event_dummies),
            features=list(spec.features),
            source_transforms=source_transforms_map(spec.sources),
        )
        quality = _quality_to_json(build.report)

        if build.report.has_errors:
            reason = "; ".join(i.message for i in build.report.errors)
            jobstore.mark_failed(job_id, f"data quality errors: {reason}")
            return {"status": "failed", "reason": "data_quality", "quality": quality}

        jobstore.update_progress(job_id, "sampling")
        summary, idata = fit_fn(build.data, spec.model, **spec.sample)

        if spec.evaluation.cross_validation or spec.evaluation.placebo:
            summary = evaluate_fn(build.data, spec.model, summary, spec.evaluation)

        jobstore.update_progress(job_id, "saving")
        # Heavy trace -> Storage; small summary -> Postgres.
        artifact_path: str | None = None
        try:
            data = netcdf_bytes(idata)
            artifact_path = f"{artifact_prefix}/{project_id}/{job_id}.nc"
            storage.upload(artifact_path, data, "application/x-netcdf")
        except Exception:
            artifact_path = None  # a missing trace must not lose the usable summary

        run_id = jobstore.save_model_run(
            project_id=project_id,
            job_id=job_id,
            summary=summary.to_json_dict(),
            quality=quality,
            inference_data_path=artifact_path,
        )
        jobstore.mark_succeeded(job_id)
        return {
            "status": "succeeded",
            "model_run_id": run_id,
            "inference_data_path": artifact_path,
        }

    except Exception as exc:
        jobstore.mark_failed(job_id, f"{type(exc).__name__}: {exc}")
        return {"status": "failed", "reason": "exception", "error": str(exc)}


def run_hier_job(
    jobstore: JobStore,
    storage: Storage,
    job_id: str,
    *,
    fit_fn=None,
    netcdf_bytes=_default_netcdf_bytes,
    artifact_prefix: str = "runs",
) -> dict:
    """Run one hierarchical (multi-region) fit job end-to-end — the ``type='fit_hierarchical'``
    counterpart of :func:`run_job`. Same status-transition/error-handling contract; the
    difference is downloading + aligning sources per region
    (:func:`mmm_core.build_master_datasets_by_region`) and fitting
    :func:`mmm_core.model.hierarchical.fit_hierarchical` instead of the single-region path.
    """
    if fit_fn is None:
        from mmm_core.model.hierarchical import fit_hierarchical as fit_fn  # type: ignore

    job = jobstore.get_job(job_id)
    project_id = job["project_id"]
    jobstore.mark_running(job_id)

    try:
        spec = parse_hier_job_config(job["config"])
    except Exception as exc:  # malformed config is a permanent failure
        jobstore.mark_failed(job_id, f"invalid job config: {exc}")
        return {"status": "failed", "reason": "invalid_config", "error": str(exc)}

    try:
        jobstore.update_progress(job_id, "downloading")
        sources_by_region = {}
        transforms_by_region = {}
        for region, refs in spec.regions.items():
            frames = []
            for ref in refs:
                raw = storage.download(ref.storage_path)
                frames.append((ref.spec, read_table(ref.storage_path, raw)))
            sources_by_region[region] = frames
            transforms_by_region[region] = source_transforms_map(refs)

        jobstore.update_progress(job_id, "building_dataset")
        region_frames, report = build_master_datasets_by_region(
            sources_by_region,
            event_dummies=list(spec.event_dummies),
            features=list(spec.features),
            source_transforms=transforms_by_region,
        )
        quality = _quality_to_json(report)

        if report.has_errors or not region_frames:
            reason = "; ".join(i.message for i in report.errors) or "no overlapping region data"
            jobstore.mark_failed(job_id, f"data quality errors: {reason}")
            return {"status": "failed", "reason": "data_quality", "quality": quality}

        jobstore.update_progress(job_id, "sampling")
        summary, idata = fit_fn(region_frames, spec.model, **spec.sample)

        jobstore.update_progress(job_id, "saving")
        artifact_path: str | None = None
        try:
            data = netcdf_bytes(idata)
            artifact_path = f"{artifact_prefix}/{project_id}/{job_id}.nc"
            storage.upload(artifact_path, data, "application/x-netcdf")
        except Exception:
            artifact_path = None  # a missing trace must not lose the usable summary

        # A `kind` discriminator so the wizard can tell a hierarchical summary apart from
        # a single-region FitSummary — HierSummary itself stays a plain mmm-core dataclass
        # with no notion of this app-level convention.
        summary_json = summary.to_json_dict()
        summary_json["kind"] = "hierarchical"

        run_id = jobstore.save_model_run(
            project_id=project_id,
            job_id=job_id,
            summary=summary_json,
            quality=quality,
            inference_data_path=artifact_path,
        )
        jobstore.mark_succeeded(job_id)
        return {
            "status": "succeeded",
            "model_run_id": run_id,
            "inference_data_path": artifact_path,
        }

    except Exception as exc:
        jobstore.mark_failed(job_id, f"{type(exc).__name__}: {exc}")
        return {"status": "failed", "reason": "exception", "error": str(exc)}
