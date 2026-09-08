"""Building one dataset version, without Supabase or Modal.

The important property under test is not "the merge works" — mmm-core's own suite covers
that — but that a recipe cannot reach data it has no right to, and that a failure leaves
the row in a state the user can act on rather than stuck on 'building'.
"""

from __future__ import annotations

import hashlib

import pytest

from mmm_worker.prepare import build_dataset_version
from mmm_worker.ports import ErrorCode
from tests.fakes import FakeDatasetStore, FakeStorage

KPI_CSV = "week,revenue\n" + "".join(
    f"2024-{1 + i // 4:02d}-{1 + (i % 4) * 7:02d},{1000 + i * 10}\n" for i in range(40)
)
SPEND_CSV = "date,spend\n" + "".join(
    f"2024-{1 + i // 4:02d}-{1 + (i % 4) * 7:02d},{100 + i}\n" for i in range(40)
)

RECIPE = {
    "sources": [
        {
            "source_file_id": "file-kpi",
            "name": "revenue",
            "date_column": "week",
            "columns": [{"name": "revenue", "role": "kpi"}],
        },
        {
            "source_file_id": "file-spend",
            "name": "search",
            "date_column": "date",
            "columns": [{"name": "spend", "role": "spend", "output_name": "search_spend"}],
        },
    ]
}


def _store(recipe=None, paths=None):
    return FakeDatasetStore(
        {"id": "ds-1", "project_id": "proj-1", "recipe": recipe if recipe is not None else RECIPE},
        storage_paths=paths
        if paths is not None
        else {"file-kpi": "proj-1/kpi.csv", "file-spend": "proj-1/spend.csv"},
    )


def _storage(**kw):
    return FakeStorage(
        {"proj-1/kpi.csv": KPI_CSV.encode(), "proj-1/spend.csv": SPEND_CSV.encode()}, **kw
    )


# --- the happy path -----------------------------------------------------------------


def test_a_built_dataset_is_hashed_so_a_run_can_be_traced_back_to_it():
    store, storage = _store(), _storage()
    result = build_dataset_version(store, storage, "ds-1")
    assert result["status"] == "ready"
    written = storage.uploads[result["master_path"]]
    assert store.ready["master_sha256"] == hashlib.sha256(written).hexdigest()


def test_the_report_carries_roles_window_and_a_preview():
    store, storage = _store(), _storage()
    build_dataset_version(store, storage, "ds-1")
    ready = store.ready
    assert ready["column_roles"] == {"revenue": "kpi", "search_spend": "spend"}
    assert ready["window_start"] and ready["window_end"]
    assert ready["n_weeks"] > 0
    assert ready["verdict"] in ("usable", "usable_with_warnings")
    assert ready["preview"]["head"] and ready["preview"]["summary"]["revenue"]["role"] == "kpi"


def test_the_suitability_report_is_kept_even_on_a_clean_build():
    """The informational issues explain what was decided automatically; dropping them on a
    clean build would make those decisions invisible."""
    store, storage = _store(), _storage()
    build_dataset_version(store, storage, "ds-1")
    assert "issues" in store.ready["suitability"]


# --- a recipe cannot reach another project's data --------------------------------------


def test_a_source_file_outside_this_project_is_refused():
    """v1 took `storage_path` straight from the client and downloaded it with the
    service-role key, which bypasses row-level security. The recipe now carries ids, and
    they are resolved against this project's own rows."""
    store = _store(paths={"file-kpi": "proj-1/kpi.csv"})  # 'file-spend' belongs elsewhere
    result = build_dataset_version(store, _storage(), "ds-1")
    assert result["code"] == ErrorCode.CONFIG_INVALID
    assert store.dataset["status"] == "failed"
    assert "does not belong to this project" in store.failure["technical"]


def test_there_is_no_way_to_name_a_raw_path_in_a_recipe():
    recipe = {
        "sources": [
            {
                "storage_path": "some-other-project/secrets.csv",
                "name": "sneaky",
                "columns": [{"name": "revenue", "role": "kpi"}],
            }
        ]
    }
    store = _store(recipe=recipe)
    result = build_dataset_version(store, _storage(), "ds-1")
    # Missing `source_file_id`, so it fails on the contract rather than being honoured.
    assert result["code"] == ErrorCode.CONFIG_INVALID


# --- idempotency ------------------------------------------------------------------------


def test_a_second_container_for_the_same_dataset_does_nothing():
    store, storage = _store(), _storage()
    build_dataset_version(store, storage, "ds-1")
    uploads_before = dict(storage.uploads)
    assert build_dataset_version(store, storage, "ds-1") == {
        "status": "skipped",
        "reason": "already_claimed",
    }
    assert storage.uploads == uploads_before


# --- failures leave an actionable row ------------------------------------------------------


def test_a_data_quality_error_is_explained_in_plain_language():
    # Two sources with no overlapping period at all.
    late = "date,spend\n2030-01-07,100\n2030-01-14,120\n2030-01-21,90\n"
    storage = FakeStorage({"proj-1/kpi.csv": KPI_CSV.encode(), "proj-1/spend.csv": late.encode()})
    store = _store()
    result = build_dataset_version(store, storage, "ds-1")
    assert result["code"] == ErrorCode.DATA_QUALITY
    assert store.dataset["status"] == "failed"
    assert "niet gebruikt worden" in store.failure["user_message"]
    assert store.failure["technical"]


def test_a_storage_outage_is_reported_as_such_not_as_bad_data():
    store = _store()
    result = build_dataset_version(store, FakeStorage({}), "ds-1")
    assert result["code"] == ErrorCode.STORAGE_UNAVAILABLE
    assert store.dataset["status"] == "failed"


def test_a_failure_never_leaves_the_row_building():
    store = _store()
    build_dataset_version(store, FakeStorage({}), "ds-1")
    assert store.dataset["status"] != "building"
