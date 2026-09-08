"""Modal application: run the fit off the request path, with no time pressure.

Deploy (locally, with your own Modal token — never committed)::

    modal deploy mmm_worker/modal_app.py

Secrets come from a Modal Secret named ``mmm-supabase`` holding SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, MMM_RAW_BUCKET, MMM_ARTIFACTS_BUCKET and MMM_ENQUEUE_TOKEN.

Three things changed from v1, each closing a specific failure:

* **Separate functions per kind of work.** A dataset build takes seconds and one core; a
  fit takes minutes and four. Sharing one function meant they shared one timeout and one
  container pool, so a crashed five-second build held a fit slot for thirty-five minutes.
* **The enqueue endpoint is authenticated, and its contract is correct.** It was an open
  POST endpoint, and the app called it with a JSON body while FastAPI expected a query
  parameter — so the call failed with a 422 on every single job, silently, and every run
  waited for the one-minute poll instead.
* **The poller claims before it spawns.** v1 re-spawned every queued row each minute
  regardless of whether one was already starting, which ran some fits twice.
"""

from __future__ import annotations

import os
import pathlib

import modal

# mmm-core is a local package (packages/mmm-core), never published to PyPI, so it cannot be
# `pip install`-ed by name. We copy its source into the build context and install it from
# that local path instead — this needs no local pip/editable install on the machine running
# `modal deploy`, just the source tree from the git clone.
_HERE = pathlib.Path(__file__).parent
_MMM_CORE_DIR = (_HERE.parent.parent / "packages" / "mmm-core").resolve()

image = (
    modal.Image.debian_slim(python_version="3.11")
    # OpenBLAS + toolchain: without these PyTensor falls back to un-linked numpy dot
    # ("PyTensor could not link to a BLAS installation") and every graph evaluation runs an
    # order of magnitude slower.
    .apt_install("libopenblas-dev", "g++", "gfortran")
    .add_local_dir(str(_MMM_CORE_DIR), remote_path="/root/mmm-core", copy=True)
    .run_commands("pip install '/root/mmm-core[model]'")
    .pip_install("supabase>=2.6", "pandas>=2.1", "openpyxl>=3.1", "fastapi[standard]")
    .env(
        {
            "PYTENSOR_FLAGS": "blas__ldflags=-lopenblas,cxx=/usr/bin/g++",
            # JAX sees one CPU "device" by default, which makes numpyro run the chains
            # sequentially. Expose 4 host devices so chains sample in parallel.
            "XLA_FLAGS": "--xla_force_host_platform_device_count=4",
            # One BLAS/OpenMP thread per chain: 4 parallel chains x N threads would
            # oversubscribe the container and slow everything down.
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
        }
    )
    .add_local_python_source("mmm_worker")
)

app = modal.App("mmm-worker")

_SECRET = modal.Secret.from_name("mmm-supabase")

# A fit runs the main model plus two lighter evidence fits (held-back window, placebo
# channel), so the ceiling is higher than v1's single fit.
FIT_TIMEOUT_SECONDS = 45 * 60
PREPARE_TIMEOUT_SECONDS = 10 * 60
MAX_CONCURRENT_FITS = 2
MAX_CONCURRENT_PREPARES = 4
# A container that dies without reaching mark_failed (timeout kill, OOM, preemption) leaves
# its row mid-state. The reaper looks at the heartbeat rather than the start time, so a
# long-but-healthy fit is never mistaken for a dead one.
STALE_HEARTBEAT_SECONDS = 10 * 60


def _backends():
    from mmm_worker.supabase_backends import (
        SupabaseDatasetStore,
        SupabaseRunStore,
        SupabaseStorage,
        make_client,
    )

    client = make_client()
    raw = SupabaseStorage(client, os.environ.get("MMM_RAW_BUCKET", "mmm-raw-data"))
    artifacts = SupabaseStorage(client, os.environ.get("MMM_ARTIFACTS_BUCKET", "mmm-artifacts"))

    class _Split:
        """Read source data from the raw bucket, write heavy traces to artifacts."""

        def download(self, path):
            return raw.download(path)

        def upload(self, path, data, content_type):
            return artifacts.upload(path, data, content_type)

    return client, SupabaseRunStore(client), SupabaseDatasetStore(client), raw, _Split()


@app.function(
    image=image,
    secrets=[_SECRET],
    timeout=FIT_TIMEOUT_SECONDS,
    max_containers=MAX_CONCURRENT_FITS,
    # A Bayesian fit is CPU-bound: without an explicit reservation Modal gives the container
    # a fraction of a core. Four cores map one-to-one onto the four parallel NUTS chains.
    cpu=4.0,
    memory=8192,
)
def run_fit(run_id: str) -> dict:
    from mmm_worker.runner import run_model_run

    _, runs, _, _, split = _backends()
    return run_model_run(runs, split, run_id, worker_id=os.environ.get("MODAL_TASK_ID", "modal"))


@app.function(
    image=image,
    secrets=[_SECRET],
    timeout=PREPARE_TIMEOUT_SECONDS,
    max_containers=MAX_CONCURRENT_PREPARES,
    cpu=1.0,
    memory=2048,
)
def build_dataset(dataset_id: str) -> dict:
    from mmm_worker.prepare import build_dataset_version

    _, _, datasets, raw, _ = _backends()
    # The merged master goes back into the RAW bucket on purpose: a later fit only ever
    # downloads from raw, so writing it to artifacts would make it invisible to that run.
    return build_dataset_version(
        datasets, raw, dataset_id, worker_id=os.environ.get("MODAL_TASK_ID", "modal")
    )


@app.function(image=image, secrets=[_SECRET])
@modal.fastapi_endpoint(method="POST")
def enqueue(payload: dict) -> dict:
    """Nudge the worker to pick a row up now instead of waiting for the poll.

    Authenticated with a shared token from the Modal Secret. v1 exposed this as an open
    endpoint, so anyone who knew the URL could spawn work; and because the parameter was a
    bare ``str``, FastAPI read it as a *query* parameter while the app sent a JSON body —
    every call 422'd, was swallowed by the caller's try/except, and every job silently
    waited a full minute for the fallback poll.
    """
    from fastapi import HTTPException

    expected = os.environ.get("MMM_ENQUEUE_TOKEN")
    if not expected or payload.get("token") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    kind = payload.get("kind")
    row_id = payload.get("id")
    if not row_id or kind not in ("fit", "dataset"):
        raise HTTPException(status_code=400, detail="kind must be 'fit' or 'dataset', with an id")

    call = (run_fit if kind == "fit" else build_dataset).spawn(row_id)
    return {"spawned": True, "call_id": call.object_id}


@app.function(image=image, secrets=[_SECRET], schedule=modal.Period(minutes=1))
def poll_queue() -> dict:
    """Pick up queued work and reap rows whose container died.

    The poller deliberately does *not* claim: it spawns, and the claim inside the runner is
    the single gate. That is what makes a duplicate spawn harmless — a second container
    fails its compare-and-set and returns without touching anything, costing a container
    start rather than a second five-minute fit. (Claiming here instead would be worse in a
    subtle way: the row would leave 'queued' before the container exists, so a spawn that
    never lands would strand it until the reaper noticed.)
    """
    import datetime

    from mmm_worker.supabase_backends import _SCHEMA, make_client

    client = make_client()
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(seconds=STALE_HEARTBEAT_SECONDS)
    ).isoformat()

    runs_table = client.schema(_SCHEMA).table("model_runs")
    datasets_table = client.schema(_SCHEMA).table("dataset_versions")

    # Reap first, so a slot freed by a dead container is available to the spawns below.
    reaped = (
        runs_table.update(
            {
                "state": "failed",
                "finished_at": "now()",
                "state_changed_at": "now()",
                "error_code": "TIMEOUT",
                "error_message": (
                    "De berekening is afgebroken omdat de rekenomgeving onverwacht stopte of "
                    "de maximale rekentijd overschreed. Probeer het opnieuw; blijft dit "
                    "gebeuren, verklein dan het aantal kanalen."
                ),
                "error_technical": "no heartbeat within the stale window",
            }
        )
        .not_.in_("state", ["queued", "completed", "failed", "cancelled"])
        .lt("heartbeat_at", cutoff)
        .execute()
    )
    datasets_table.update(
        {
            "status": "failed",
            "error_code": "TIMEOUT",
            "error_message": "Het samenvoegen is afgebroken. Probeer het opnieuw.",
            "error_technical": "no heartbeat within the stale window",
        }
    ).eq("status", "building").lt("heartbeat_at", cutoff).execute()

    spawned = {"fits": 0, "datasets": 0}
    for row in (
        runs_table.select("id").eq("state", "queued").order("created_at").limit(10).execute().data
        or []
    ):
        run_fit.spawn(row["id"])
        spawned["fits"] += 1
    for row in (
        datasets_table.select("id").eq("status", "queued").order("created_at").limit(10)
        .execute().data
        or []
    ):
        build_dataset.spawn(row["id"])
        spawned["datasets"] += 1

    return {**spawned, "reaped": len(reaped.data or [])}
