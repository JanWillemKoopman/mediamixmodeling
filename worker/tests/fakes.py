"""In-memory fakes for the worker ports, plus stub fit functions.

These let the whole orchestration — claiming, state transitions, the prior gate, evidence
gathering, error classification, retries — be tested without Supabase, Modal or a real
PyMC fit. That matters more than usual here: the lifecycle bugs the audit found (a job
running twice, a run stuck mid-state, a raw traceback shown to a user) are all orchestration
bugs, and none of them need a sampler to reproduce.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from mmm_worker.ports import ErrorCode, RunState


class FakeRunStore:
    """Records every transition so a test can assert the whole path, not just the end."""

    def __init__(self, run: dict, configuration: dict, dataset: dict):
        self.run = {"attempt": 0, "max_attempts": 2, "cancel_requested": False, **run}
        self.configuration = configuration
        self.dataset = dataset
        self.states: list[str] = []
        self.claims = 0
        self.heartbeats = 0
        self.completed: dict | None = None
        self.failure: dict | None = None
        self.requeued = False
        self.diagnostics: dict | None = None
        self.validation: dict | None = None
        self.results: dict | None = None

    # --- lifecycle ---
    def get_run(self, run_id: str) -> dict:
        return self.run

    def claim(self, run_id: str, worker: str) -> bool:
        self.claims += 1
        if self.run.get("state", RunState.QUEUED) != RunState.QUEUED:
            return False   # somebody else already has it
        self.run["state"] = RunState.VALIDATING
        self.run["attempt"] += 1
        self.states.append(RunState.VALIDATING)
        return True

    def set_state(self, run_id: str, state: str) -> None:
        self.run["state"] = state
        self.states.append(state)

    def heartbeat(self, run_id: str) -> None:
        self.heartbeats += 1

    def is_cancel_requested(self, run_id: str) -> bool:
        return bool(self.run.get("cancel_requested"))

    def mark_completed(self, run_id: str, *, provenance: dict) -> None:
        self.run["state"] = RunState.COMPLETED
        self.states.append(RunState.COMPLETED)
        self.completed = provenance

    def mark_failed(self, run_id, *, code, user_message, technical, retryable) -> None:
        attempts_left = self.run["attempt"] < self.run["max_attempts"]
        if retryable and attempts_left:
            self.run["state"] = RunState.QUEUED
            self.requeued = True
        else:
            self.run["state"] = (
                RunState.CANCELLED if code == ErrorCode.CANCELLED else RunState.FAILED
            )
        self.states.append(self.run["state"])
        self.failure = {
            "code": code,
            "user_message": user_message,
            "technical": technical,
            "retryable": retryable,
        }

    # --- reads ---
    def get_configuration(self, configuration_id: str) -> dict:
        return self.configuration

    def get_dataset_version(self, dataset_version_id: str) -> dict:
        return self.dataset

    # --- writes ---
    def save_diagnostics(self, run_id: str, diagnostics: dict) -> None:
        self.diagnostics = diagnostics

    def save_validation(self, run_id: str, validation: dict) -> None:
        self.validation = validation

    def save_results(self, run_id, project_id, summary, inference_data_path) -> None:
        self.results = {
            "project_id": project_id,
            "summary": summary,
            "inference_data_path": inference_data_path,
        }


class FakeStorage:
    def __init__(self, files: dict[str, bytes] | None = None, *, fail_upload: bool = False):
        self.files = dict(files or {})
        self.uploads: dict[str, bytes] = {}
        self.fail_upload = fail_upload

    def download(self, path: str) -> bytes:
        if path not in self.files:
            raise FileNotFoundError(f"storage: no object at {path!r}")
        return self.files[path]

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        if self.fail_upload:
            raise RuntimeError("storage upload unavailable")
        self.uploads[path] = data


class FakeDatasetStore:
    def __init__(self, dataset: dict, storage_paths: dict[str, str] | None = None):
        self.dataset = {"status": "queued", **dataset}
        self.paths = storage_paths or {}
        self.claims = 0
        self.heartbeats = 0
        self.ready: dict | None = None
        self.failure: dict | None = None

    def get_dataset_version(self, dataset_id: str) -> dict:
        return self.dataset

    def claim(self, dataset_id: str, worker: str) -> bool:
        self.claims += 1
        if self.dataset.get("status") != "queued":
            return False
        self.dataset["status"] = "building"
        return True

    def heartbeat(self, dataset_id: str) -> None:
        self.heartbeats += 1

    def storage_paths(self, project_id: str) -> dict[str, str]:
        return dict(self.paths)

    def mark_ready(self, dataset_id: str, **fields) -> None:
        self.dataset["status"] = "ready"
        self.ready = {"id": dataset_id, **fields}

    def mark_failed(self, dataset_id, *, code, user_message, technical) -> None:
        self.dataset["status"] = "failed"
        self.failure = {"code": code, "user_message": user_message, "technical": technical}


@dataclass
class StubValidation:
    level_value: str = "statistically_valid"

    @property
    def level(self):
        class _L:
            value = self.level_value

        return _L()

    def to_json_dict(self) -> dict:
        return {
            "level": self.level_value,
            "ruleset_version": "test",
            "allowed_outputs": ["diagnostics"],
            "blocking_reasons": [],
            "warning_reasons": [],
            "checks": [],
            "per_channel": [],
            "inseparable_groups": [],
        }


@dataclass
class StubDiagnostics:
    max_r_hat: float = 1.0
    min_ess_bulk: float = 900.0
    min_ess_tail: float = 850.0
    n_divergences: int = 0
    min_e_bfmi: float = 0.9
    n_max_treedepth: int = 0
    r2: float = 0.85
    mape: float = 0.08
    interval_coverage_94: float = 0.94
    interval_coverage_80: float = 0.81
    interval_coverage_50: float = 0.52
    residual_autocorrelation: float = 0.05
    decomposition_ok: bool = True


@dataclass
class StubSummary:
    payload: dict = field(default_factory=lambda: {"channels": [], "kpi": "revenue"})
    diagnostics: StubDiagnostics = field(default_factory=StubDiagnostics)
    validation: StubValidation | None = field(default_factory=StubValidation)

    def to_json_dict(self) -> dict:
        return self.payload


def make_stub_fit(summary=None, *, raises: Exception | None = None):
    """A ``fit_fn(data, config, **kw)`` that records its call and returns a stub."""
    calls: list[dict] = []

    def fit_fn(data, config, **kwargs):
        calls.append(
            {
                "n_rows": len(data),
                "columns": list(data.columns),
                "kwargs": kwargs,
                "holdout_mape": kwargs.get("holdout_mape"),
                "placebo_share": kwargs.get("placebo_share"),
            }
        )
        if raises is not None:
            raise raises
        return (summary or StubSummary()), _StubIdata()

    fit_fn.calls = calls
    return fit_fn


class _StubIdata:
    def to_netcdf(self, path):  # pragma: no cover - only touched by the real serializer
        with open(path, "wb") as fh:
            fh.write(b"stub")


def make_stub_evidence(holdout: float | None = 0.12, placebo: float | None = 0.01):
    calls: list[dict] = []

    def evidence(data, config, *, seed, log):
        calls.append({"seed": seed})
        return holdout, placebo

    evidence.calls = calls
    return evidence


def no_prior_gate(data, config) -> None:
    """A prior gate that always passes, for tests about other things."""
