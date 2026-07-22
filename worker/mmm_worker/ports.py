"""Dependency ports for the worker orchestration.

The orchestration in :mod:`mmm_worker.runner` depends only on these small interfaces,
so it can be unit-tested with in-memory fakes and knows nothing about Supabase or Modal.
Concrete Supabase-backed implementations live in :mod:`mmm_worker.supabase_backends`.
"""

from __future__ import annotations

from typing import Protocol


class JobStore(Protocol):
    def get_job(self, job_id: str) -> dict:
        """Return the job row (must include 'id', 'project_id', 'config')."""

    def mark_running(self, job_id: str) -> None: ...

    def update_progress(self, job_id: str, phase: str) -> None:
        """Best-effort coarse phase update while a fit is in flight (see the
        `downloading`/`building_dataset`/`sampling`/`saving` phases in runner.py). Never
        allowed to fail the job — a progress write is purely informational."""

    def mark_succeeded(self, job_id: str) -> None: ...

    def mark_failed(self, job_id: str, error: str) -> None: ...

    def save_model_run(
        self,
        project_id: str,
        job_id: str,
        summary: dict,
        quality: dict,
        inference_data_path: str | None,
    ) -> str:
        """Persist an aggregated result row and return its id."""

    def save_prior_predictive(self, job_id: str, review: dict) -> None:
        """Store the prior-predictive review (KPI range implied by the priors) on the job
        row, so the chat architect can read it back before a full fit is spent."""


class Storage(Protocol):
    def download(self, path: str) -> bytes: ...

    def upload(self, path: str, data: bytes, content_type: str) -> None: ...


class DatasetStore(Protocol):
    """Persistence for the data-prep artifact (the mmm.datasets row)."""

    def get_dataset(self, dataset_id: str) -> dict:
        """Return the dataset row (must include 'id', 'project_id')."""

    def mark_dataset_prepared(
        self,
        dataset_id: str,
        *,
        master_path: str,
        window_start: str,
        window_end: str,
        n_weeks: int,
        column_roles: dict,
        quality: dict,
        preview: dict,
    ) -> None: ...

    def mark_dataset_failed(self, dataset_id: str, *, quality: dict, error: str) -> None: ...
