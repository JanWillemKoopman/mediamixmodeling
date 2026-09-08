"""Concrete Supabase-backed implementations of the worker ports.

Connects with the **service_role** key, which bypasses row-level security. That is exactly
why nothing in here accepts a path or an id from outside: every lookup is scoped by the
project the row itself names. This module is only imported in the deployed worker; the
``supabase`` dependency lives in the ``runtime`` extra and is not needed to run the tests.
Nothing here reads secrets from anywhere but the environment.
"""

from __future__ import annotations

import os

from mmm_worker.ports import DatasetStore, ErrorCode, RunState, RunStore, Storage

_SCHEMA = os.environ.get("MMM_DB_SCHEMA", "mmm")


def make_client():
    """Create a Supabase client from environment variables (service_role)."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # secret; provided via Modal Secret
    return create_client(url, key)


class SupabaseRunStore(RunStore):
    def __init__(self, client, schema: str = _SCHEMA):
        self._client = client
        self._schema = schema

    def _table(self, name: str):
        return self._client.schema(self._schema).table(name)

    def get_run(self, run_id: str) -> dict:
        return self._table("model_runs").select("*").eq("id", run_id).single().execute().data

    def claim(self, run_id: str, worker: str) -> bool:
        # A database function doing the compare-and-set, not two statements here: between a
        # SELECT and an UPDATE another container can claim the same run, and that gap is
        # precisely how v1 ended up running some fits twice.
        result = self._client.schema(self._schema).rpc(
            "claim_model_run", {"p_run_id": run_id, "p_worker": worker}
        ).execute()
        return bool(result.data)

    def set_state(self, run_id: str, state: str) -> None:
        self._table("model_runs").update(
            {"state": state, "state_changed_at": "now()", "heartbeat_at": "now()"}
        ).eq("id", run_id).execute()

    def heartbeat(self, run_id: str) -> None:
        try:
            self._table("model_runs").update({"heartbeat_at": "now()"}).eq("id", run_id).execute()
        except Exception:
            pass  # a missed heartbeat must never fail a healthy run

    def is_cancel_requested(self, run_id: str) -> bool:
        row = (
            self._table("model_runs")
            .select("cancel_requested")
            .eq("id", run_id)
            .single()
            .execute()
            .data
        )
        return bool(row and row.get("cancel_requested"))

    def mark_completed(self, run_id: str, *, provenance: dict) -> None:
        self._table("model_runs").update(
            {
                "state": RunState.COMPLETED,
                "state_changed_at": "now()",
                "finished_at": "now()",
                "dataset_sha256": provenance.get("dataset_sha256"),
                "spec_sha256": provenance.get("spec_sha256"),
                "seed": provenance.get("seed"),
                "sample_params": provenance.get("sample_params"),
                "package_versions": provenance.get("package_versions"),
                "worker_image_digest": provenance.get("worker_image_digest"),
                "mmm_core_version": (provenance.get("package_versions") or {}).get("mmm_core"),
                "log_tail": provenance.get("log_tail"),
            }
        ).eq("id", run_id).execute()

    def mark_failed(
        self, run_id: str, *, code: str, user_message: str, technical: str, retryable: bool
    ) -> None:
        row = (
            self._table("model_runs")
            .select("attempt, max_attempts")
            .eq("id", run_id)
            .single()
            .execute()
            .data
        ) or {}
        attempts_left = int(row.get("attempt", 1)) < int(row.get("max_attempts", 2))
        if retryable and attempts_left:
            # Back to the queue rather than dead: a transient storage blip should not cost
            # the user their run. The attempt counter (incremented on claim) bounds it.
            self._table("model_runs").update(
                {
                    "state": RunState.QUEUED,
                    "state_changed_at": "now()",
                    "claimed_by": None,
                    "claimed_at": None,
                    "error_code": code,
                    "error_message": user_message,
                    "error_technical": technical,
                }
            ).eq("id", run_id).execute()
            return
        self._table("model_runs").update(
            {
                "state": RunState.CANCELLED if code == ErrorCode.CANCELLED else RunState.FAILED,
                "state_changed_at": "now()",
                "finished_at": "now()",
                "error_code": code,
                "error_message": user_message,
                "error_technical": technical,
            }
        ).eq("id", run_id).execute()

    def get_configuration(self, configuration_id: str) -> dict:
        return (
            self._table("model_configurations")
            .select("*")
            .eq("id", configuration_id)
            .single()
            .execute()
            .data
        )

    def get_dataset_version(self, dataset_version_id: str) -> dict:
        return (
            self._table("dataset_versions")
            .select("*")
            .eq("id", dataset_version_id)
            .single()
            .execute()
            .data
        )

    def save_diagnostics(self, run_id: str, diagnostics: dict) -> None:
        self._table("model_diagnostics").upsert(
            {"model_run_id": run_id, **diagnostics}, on_conflict="model_run_id"
        ).execute()

    def save_validation(self, run_id: str, validation: dict) -> None:
        self._table("model_validations").upsert(
            {
                "model_run_id": run_id,
                "level": validation["level"],
                "ruleset_version": validation["ruleset_version"],
                "allowed_outputs": validation["allowed_outputs"],
                "blocking_reasons": validation["blocking_reasons"],
                "warning_reasons": validation["warning_reasons"],
                "checks": validation["checks"],
                "per_channel": validation["per_channel"],
                "inseparable_groups": validation["inseparable_groups"],
            },
            on_conflict="model_run_id",
        ).execute()

    def save_results(
        self, run_id: str, project_id: str, summary: dict, inference_data_path: str | None
    ) -> None:
        self._table("model_results").upsert(
            {
                "model_run_id": run_id,
                "project_id": project_id,
                "summary": summary,
                "inference_data_path": inference_data_path,
            },
            on_conflict="model_run_id",
        ).execute()


class SupabaseDatasetStore(DatasetStore):
    def __init__(self, client, schema: str = _SCHEMA):
        self._client = client
        self._schema = schema

    def _table(self, name: str):
        return self._client.schema(self._schema).table(name)

    def get_dataset_version(self, dataset_id: str) -> dict:
        return (
            self._table("dataset_versions").select("*").eq("id", dataset_id).single().execute().data
        )

    def claim(self, dataset_id: str, worker: str) -> bool:
        result = self._client.schema(self._schema).rpc(
            "claim_dataset_version", {"p_dataset_id": dataset_id, "p_worker": worker}
        ).execute()
        return bool(result.data)

    def heartbeat(self, dataset_id: str) -> None:
        try:
            self._table("dataset_versions").update({"heartbeat_at": "now()"}).eq(
                "id", dataset_id
            ).execute()
        except Exception:
            pass

    def storage_paths(self, project_id: str) -> dict[str, str]:
        rows = (
            self._table("source_files")
            .select("id, storage_path")
            .eq("project_id", project_id)
            .execute()
            .data
        ) or []
        return {r["id"]: r["storage_path"] for r in rows}

    def mark_ready(self, dataset_id: str, **fields) -> None:
        self._table("dataset_versions").update(
            {
                "status": "ready",
                "built_at": "now()",
                "error_code": None,
                "error_message": None,
                "error_technical": None,
                **fields,
            }
        ).eq("id", dataset_id).execute()

    def mark_failed(self, dataset_id: str, *, code: str, user_message: str, technical: str) -> None:
        self._table("dataset_versions").update(
            {
                "status": "failed",
                "built_at": "now()",
                "error_code": code,
                "error_message": user_message,
                "error_technical": technical,
            }
        ).eq("id", dataset_id).execute()


class SupabaseStorage(Storage):
    def __init__(self, client, bucket: str):
        self._bucket = client.storage.from_(bucket)

    def download(self, path: str) -> bytes:
        return self._bucket.download(path)

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self._bucket.upload(path, data, {"content-type": content_type, "upsert": "true"})
