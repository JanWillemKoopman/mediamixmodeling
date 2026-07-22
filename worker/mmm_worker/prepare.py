"""Run one data-prep job: download raw sources -> merge & quality-check -> persist.

This is the interactive data-preparation step, made concrete: it takes the recipe the
builder assembled (which files, which column maps to which role, how to handle gaps and
anomalies) and runs the *frozen, tested* mmm-core ingestion to produce one aligned weekly
master table. It writes that table to Storage as the definitive dataset file, and stores
the quality report + a compact preview on the dataset row so the wizard can show the
builder what was found before they approve.

Like :mod:`mmm_worker.runner` it is pure of Supabase/Modal — it talks only to the
:class:`mmm_worker.ports` interfaces — so it is unit-tested with in-memory fakes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from mmm_core import build_master_dataset

from mmm_worker.jobspec import parse_prepare_config, source_transforms_map
from mmm_worker.ports import DatasetStore, JobStore, Storage
from mmm_worker.tables import read_table

_PREVIEW_ROWS = 6


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


def _rows(frame: pd.DataFrame) -> list[dict]:
    """JSON-safe records with the week label first (NaN -> None)."""
    out: list[dict] = []
    for ts, row in frame.iterrows():
        rec: dict = {"week_start": pd.Timestamp(ts).date().isoformat()}
        for col, val in row.items():
            rec[str(col)] = None if pd.isna(val) else float(val)
        out.append(rec)
    return out


def _preview(data: pd.DataFrame, column_roles: dict) -> dict:
    """A compact, JSON-serializable snapshot of the merged master for the wizard."""
    summary = {}
    for col in data.columns:
        s = pd.to_numeric(data[col], errors="coerce")
        summary[str(col)] = {
            "role": column_roles.get(col),
            "n_missing": int(s.isna().sum()),
            "min": None if s.dropna().empty else float(np.nanmin(s.to_numpy())),
            "max": None if s.dropna().empty else float(np.nanmax(s.to_numpy())),
            "mean": None if s.dropna().empty else float(np.nanmean(s.to_numpy())),
        }
    return {
        "columns": [{"name": str(c), "role": column_roles.get(c)} for c in data.columns],
        "n_weeks": int(len(data)),
        "head": _rows(data.head(_PREVIEW_ROWS)),
        "tail": _rows(data.tail(_PREVIEW_ROWS)),
        "summary": summary,
    }


def run_prepare(
    jobstore: JobStore,
    datasets: DatasetStore,
    storage: Storage,
    job_id: str,
    *,
    artifact_prefix: str = "datasets",
) -> dict:
    """Run one prepare job end-to-end. Never raises for handled failures — the job row and
    the dataset row are marked failed and the reason returned."""
    job = jobstore.get_job(job_id)
    project_id = job["project_id"]
    config = job["config"]
    dataset_id = config.get("dataset_id")
    if not dataset_id:
        jobstore.mark_failed(job_id, "prepare job missing dataset_id")
        return {"status": "failed", "reason": "no_dataset_id"}

    jobstore.mark_running(job_id)

    try:
        spec = parse_prepare_config(config)
    except Exception as exc:
        datasets.mark_dataset_failed(dataset_id, quality={}, error=f"invalid recipe: {exc}")
        jobstore.mark_failed(job_id, f"invalid prepare config: {exc}")
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
        quality = _quality_to_json(build.report)

        if build.report.has_errors or build.window is None:
            reason = "; ".join(i.message for i in build.report.errors) or "geen overlappende periode"
            datasets.mark_dataset_failed(dataset_id, quality=quality, error=reason)
            jobstore.mark_failed(job_id, f"data quality errors: {reason}")
            return {"status": "failed", "reason": "data_quality", "quality": quality}

        column_roles = {name: role.value for name, role in build.column_roles.items() if name in build.data.columns}
        master_path = f"{artifact_prefix}/{project_id}/{dataset_id}.csv"
        storage.upload(master_path, build.data.to_csv().encode(), "text/csv")

        datasets.mark_dataset_prepared(
            dataset_id,
            master_path=master_path,
            window_start=build.window[0].date().isoformat(),
            window_end=build.window[1].date().isoformat(),
            n_weeks=int(len(build.data)),
            column_roles=column_roles,
            quality=quality,
            preview=_preview(build.data, column_roles),
        )
        jobstore.mark_succeeded(job_id)
        return {"status": "succeeded", "dataset_id": dataset_id, "master_path": master_path}

    except Exception as exc:
        datasets.mark_dataset_failed(dataset_id, quality={}, error=f"{type(exc).__name__}: {exc}")
        jobstore.mark_failed(job_id, f"{type(exc).__name__}: {exc}")
        return {"status": "failed", "reason": "exception", "error": str(exc)}
