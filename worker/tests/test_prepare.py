import pandas as pd
import pytest

from fakes import FakeDatasetStore, FakeJobStore, FakeStorage
from mmm_worker.prepare import run_prepare
from mmm_worker.jobspec import parse_prepare_config


def _csv(start, periods, value_col, value):
    dates = pd.date_range(start, periods=periods, freq="D")
    return pd.DataFrame({"date": dates, value_col: value}).to_csv(index=False).encode()


def _recipe(dataset_id="ds-1"):
    return {
        "dataset_id": dataset_id,
        "sources": [
            {"name": "revenue", "storage_path": "rev.csv", "date_column": "date",
             "columns": [{"name": "revenue", "role": "kpi"}]},
            {"name": "google", "storage_path": "g.csv", "date_column": "date",
             "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
        ],
    }


def _job(config, project_id="proj-1", job_id="job-1"):
    return {"id": job_id, "project_id": project_id, "type": "prepare", "config": config}


# --- config parsing --------------------------------------------------------------

def test_parse_prepare_config_has_sources_and_dummies():
    cfg = _recipe()
    cfg["event_dummies"] = [{"name": "d_2025w45", "weeks": [[2025, 45]]}]
    spec = parse_prepare_config(cfg)
    assert [s.storage_path for s in spec.sources] == ["rev.csv", "g.csv"]
    assert spec.event_dummies[0].name == "d_2025w45"


# --- happy path ------------------------------------------------------------------

def test_prepare_merges_and_writes_master_and_preview():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    store = FakeJobStore(_job(_recipe()))
    datasets = FakeDatasetStore()

    result = run_prepare(store, datasets, FakeStorage(files), "job-1")

    assert result["status"] == "succeeded"
    assert store.status == "succeeded"
    assert datasets.prepared is not None
    p = datasets.prepared
    assert p["master_path"] == "datasets/proj-1/ds-1.csv"
    assert p["n_weeks"] == 12                       # 84 daily rows -> 12 ISO weeks
    assert p["column_roles"] == {"revenue": "kpi", "google_spend": "spend"}
    assert p["window_start"] == "2022-01-03"
    # preview carries a head/tail and per-column summary the wizard can render
    assert p["preview"]["columns"][0]["name"] in {"revenue", "google_spend"}
    assert len(p["preview"]["head"]) == 6
    assert "revenue" in p["preview"]["summary"]
    # the merged master file was actually written (uploaded)


def test_prepare_master_file_is_written_to_storage():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    storage = FakeStorage(files)
    run_prepare(FakeJobStore(_job(_recipe())), FakeDatasetStore(), storage, "job-1")
    assert "datasets/proj-1/ds-1.csv" in storage.uploads
    body = storage.uploads["datasets/proj-1/ds-1.csv"].decode()
    assert "week_start" in body and "google_spend" in body


# --- failure handling ------------------------------------------------------------

def test_prepare_data_quality_error_marks_dataset_failed():
    # revenue and spend never overlap -> ingestion reports an error, no master written.
    files = {"rev.csv": _csv("2022-01-03", 30, "revenue", 1000.0),
             "g.csv": _csv("2022-06-01", 30, "spend", 50.0)}
    datasets = FakeDatasetStore()
    store = FakeJobStore(_job(_recipe()))

    result = run_prepare(store, datasets, FakeStorage(files), "job-1")

    assert result["status"] == "failed"
    assert result["reason"] == "data_quality"
    assert store.status == "failed"
    assert datasets.failed is not None
    assert datasets.prepared is None


def test_prepare_missing_dataset_id_fails():
    cfg = _recipe()
    del cfg["dataset_id"]
    store = FakeJobStore(_job(cfg))
    result = run_prepare(store, FakeDatasetStore(), FakeStorage({}), "job-1")
    assert result["status"] == "failed"
    assert result["reason"] == "no_dataset_id"


def test_prepare_invalid_recipe_marks_failed():
    cfg = {"dataset_id": "ds-1", "sources": []}  # no sources
    store = FakeJobStore(_job(cfg))
    datasets = FakeDatasetStore()
    result = run_prepare(store, datasets, FakeStorage({}), "job-1")
    assert result["status"] == "failed"
    assert result["reason"] == "invalid_config"
    assert datasets.failed is not None
