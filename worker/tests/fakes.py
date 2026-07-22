"""In-memory fakes for the worker ports, plus a stub fit function.

These let us test the whole orchestration (status transitions, storage split, error
handling) without Supabase, Modal or a real PyMC fit.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class FakeJobStore:
    def __init__(self, job: dict):
        self.job = job
        self.status = job.get("status", "queued")
        self.progress: str | None = None
        self.error: str | None = None
        self.runs: list[dict] = []
        self.prior_predictive: dict | None = None

    def get_job(self, job_id: str) -> dict:
        return self.job

    def mark_running(self, job_id: str) -> None:
        self.status = "running"

    def update_progress(self, job_id: str, phase: str) -> None:
        self.progress = phase

    def mark_succeeded(self, job_id: str) -> None:
        self.status = "succeeded"

    def mark_failed(self, job_id: str, error: str) -> None:
        self.status = "failed"
        self.error = error

    def save_model_run(self, project_id, job_id, summary, quality, inference_data_path) -> str:
        self.runs.append(
            {
                "project_id": project_id,
                "job_id": job_id,
                "summary": summary,
                "quality": quality,
                "inference_data_path": inference_data_path,
            }
        )
        return "run-1"

    def save_prior_predictive(self, job_id: str, review: dict) -> None:
        self.prior_predictive = review


class FakeStorage:
    def __init__(self, files: dict[str, bytes]):
        self.files = dict(files)
        self.uploads: dict[str, bytes] = {}

    def download(self, path: str) -> bytes:
        return self.files[path]

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self.uploads[path] = data


class FakeDatasetStore:
    def __init__(self, dataset: dict | None = None):
        self.dataset = dataset or {"id": "ds-1", "project_id": "proj-1"}
        self.prepared: dict | None = None
        self.failed: dict | None = None

    def get_dataset(self, dataset_id: str) -> dict:
        return self.dataset

    def mark_dataset_prepared(self, dataset_id, **fields) -> None:
        self.prepared = {"id": dataset_id, **fields}

    def mark_dataset_failed(self, dataset_id, *, quality, error) -> None:
        self.failed = {"id": dataset_id, "quality": quality, "error": error}


@dataclass
class StubSummary:
    payload: dict = field(default_factory=lambda: {"channels": [], "kpi": "revenue"})

    def to_json_dict(self) -> dict:
        return self.payload


def make_stub_fit(summary=None):
    """Return a fit_fn(data, model, **kw) that records its call and returns a stub."""
    calls = []

    def fit_fn(data, model, **kwargs):
        calls.append(
            {"n_rows": len(data), "columns": list(data.columns), "model": model, "kwargs": kwargs}
        )
        return (summary or StubSummary()), object()  # (summary, fake idata)

    fit_fn.calls = calls
    return fit_fn


def make_stub_hier_fit(summary=None):
    """Return a fit_fn(region_frames, model, **kw) for run_hier_job, records its call."""
    calls = []

    def fit_fn(region_frames, model, **kwargs):
        calls.append({"regions": sorted(region_frames), "model": model, "kwargs": kwargs})
        return (summary or StubSummary()), object()

    fit_fn.calls = calls
    return fit_fn
