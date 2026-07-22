import pandas as pd
import pytest

from fakes import FakeJobStore, FakeStorage, StubSummary, make_stub_fit, make_stub_hier_fit
from mmm_worker.runner import run_hier_job, run_job


def _csv(start, periods, value_col, value):
    dates = pd.date_range(start, periods=periods, freq="D")
    return pd.DataFrame({"date": dates, value_col: value}).to_csv(index=False).encode()


def _job(config, project_id="proj-1", job_id="job-1"):
    return {"id": job_id, "project_id": project_id, "config": config}


def _overlapping_config():
    return {
        "sources": [
            {"name": "revenue", "storage_path": "rev.csv", "date_column": "date",
             "columns": [{"name": "revenue", "role": "kpi"}]},
            {"name": "google", "storage_path": "g.csv", "date_column": "date",
             "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
        ],
        "model": {"kpi": "revenue", "channels": [{"name": "google_spend", "channel_type": "intent"}]},
        "sample": {"draws": 100, "tune": 100, "chains": 2, "bogus": 1},
    }


def test_happy_path_persists_summary_and_uploads_trace():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    store = FakeJobStore(_job(_overlapping_config()))
    storage = FakeStorage(files)
    fit = make_stub_fit()

    result = run_job(store, storage, "job-1", fit_fn=fit, netcdf_bytes=lambda idata: b"NETCDF")

    assert result["status"] == "succeeded"
    assert store.status == "succeeded"
    assert store.progress == "saving"  # last phase written before completion
    assert len(store.runs) == 1
    assert store.runs[0]["summary"]["kpi"] == "revenue"
    # bogus sample key filtered out, unsafe values clamped before reaching the fit
    assert fit.calls[0]["kwargs"] == {"draws": 250, "tune": 250, "chains": 4}
    # heavy trace uploaded under runs/<project>/<job>.nc
    assert store.runs[0]["inference_data_path"] == "runs/proj-1/job-1.nc"
    assert storage.uploads["runs/proj-1/job-1.nc"] == b"NETCDF"


def test_data_quality_error_fails_job_without_fitting():
    # revenue and spend never overlap -> ingestion reports an error, fit must not run.
    files = {"rev.csv": _csv("2022-01-03", 30, "revenue", 1000.0),
             "g.csv": _csv("2022-06-01", 30, "spend", 50.0)}
    store = FakeJobStore(_job(_overlapping_config()))
    fit = make_stub_fit()

    result = run_job(store, FakeStorage(files), "job-1", fit_fn=fit, netcdf_bytes=lambda i: b"")

    assert result["status"] == "failed"
    assert result["reason"] == "data_quality"
    assert store.status == "failed"
    assert store.progress == "building_dataset"  # never advanced to "sampling"
    assert fit.calls == []          # never fitted
    assert store.runs == []


def test_invalid_config_is_permanent_failure():
    bad = _overlapping_config()
    del bad["model"]
    store = FakeJobStore(_job(bad))
    fit = make_stub_fit()

    result = run_job(store, FakeStorage({}), "job-1", fit_fn=fit)

    assert result["status"] == "failed"
    assert result["reason"] == "invalid_config"
    assert fit.calls == []


def test_event_dummy_flows_through_to_the_fit():
    # 84 daily rows from Monday 2022-01-03 span ISO weeks (2022, 1) .. (2022, 12).
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    config = _overlapping_config()
    config["event_dummies"] = [{"name": "dummy_2022w2", "weeks": [[2022, 2]]}]
    store = FakeJobStore(_job(config))
    fit = make_stub_fit()

    result = run_job(store, FakeStorage(files), "job-1", fit_fn=fit, netcdf_bytes=lambda i: b"")

    assert result["status"] == "succeeded"
    call = fit.calls[0]
    assert "dummy_2022w2" in call["columns"]
    assert "dummy_2022w2" in call["model"].control_columns


def test_evaluation_flags_off_by_default_never_call_evaluate_fn():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    store = FakeJobStore(_job(_overlapping_config()))
    calls = []

    def evaluate_fn(data, model, summary, evaluation):
        calls.append(evaluation)
        return summary

    result = run_job(
        store, FakeStorage(files), "job-1",
        fit_fn=make_stub_fit(), evaluate_fn=evaluate_fn, netcdf_bytes=lambda i: b"",
    )

    assert result["status"] == "succeeded"
    assert calls == []


def test_evaluation_flag_on_calls_evaluate_fn_and_uses_its_summary():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    config = _overlapping_config()
    config["evaluation"] = {"placebo": True}
    store = FakeJobStore(_job(config))
    calls = []

    def evaluate_fn(data, model, summary, evaluation):
        calls.append(evaluation)
        return StubSummary(payload={**summary.to_json_dict(), "evaluated": True})

    result = run_job(
        store, FakeStorage(files), "job-1",
        fit_fn=make_stub_fit(), evaluate_fn=evaluate_fn, netcdf_bytes=lambda i: b"",
    )

    assert result["status"] == "succeeded"
    assert len(calls) == 1
    assert calls[0].placebo is True
    assert calls[0].cross_validation is False
    assert store.runs[0]["summary"]["evaluated"] is True


def test_evaluate_fn_failure_fails_the_job_like_any_other_exception():
    # A sub-evaluation is meant to be defensive internally (mmm_worker.runner's real
    # _run_extra_evaluations swallows its own exceptions per-check), but if the injected
    # evaluate_fn itself raises, run_job's outer handler still catches it like any other
    # unexpected error rather than silently losing the job.
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    config = _overlapping_config()
    config["evaluation"] = {"cross_validation": True}
    store = FakeJobStore(_job(config))

    def boom(data, model, summary, evaluation):
        raise RuntimeError("evaluation blew up")

    result = run_job(
        store, FakeStorage(files), "job-1",
        fit_fn=make_stub_fit(), evaluate_fn=boom, netcdf_bytes=lambda i: b"",
    )

    assert result["status"] == "failed"
    assert store.status == "failed"
    assert store.runs == []


def test_trace_upload_failure_does_not_lose_summary():
    files = {"rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 84, "spend", 50.0)}
    store = FakeJobStore(_job(_overlapping_config()))

    def boom(idata):
        raise RuntimeError("storage down")

    result = run_job(store, FakeStorage(files), "job-1", fit_fn=make_stub_fit(), netcdf_bytes=boom)

    assert result["status"] == "succeeded"           # summary still saved
    assert store.runs[0]["inference_data_path"] is None


# --- hierarchical (multi-region) jobs ---------------------------------------------

def _hier_region_sources(prefix):
    return {
        "sources": [
            {"name": "revenue", "storage_path": f"{prefix}_rev.csv", "date_column": "date",
             "columns": [{"name": "revenue", "role": "kpi"}]},
            {"name": "google", "storage_path": f"{prefix}_g.csv", "date_column": "date",
             "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
        ]
    }


def _hier_config():
    return {
        "regions": {"NL": _hier_region_sources("nl"), "BE": _hier_region_sources("be")},
        "model": {"kpi": "revenue", "channels": [{"name": "google_spend", "channel_type": "intent"}]},
        "sample": {"draws": 100, "tune": 100, "chains": 2},
    }


def _hier_job(config, project_id="proj-1", job_id="job-1"):
    return {"id": job_id, "project_id": project_id, "config": config}


def test_hier_happy_path_persists_summary_with_kind_marker():
    files = {
        "nl_rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
        "nl_g.csv": _csv("2022-01-03", 84, "spend", 50.0),
        "be_rev.csv": _csv("2022-01-03", 84, "revenue", 800.0),
        "be_g.csv": _csv("2022-01-03", 84, "spend", 40.0),
    }
    store = FakeJobStore(_hier_job(_hier_config()))
    storage = FakeStorage(files)
    fit = make_stub_hier_fit()

    result = run_hier_job(store, storage, "job-1", fit_fn=fit, netcdf_bytes=lambda idata: b"NETCDF")

    assert result["status"] == "succeeded"
    assert store.status == "succeeded"
    assert len(store.runs) == 1
    assert store.runs[0]["summary"]["kind"] == "hierarchical"
    assert fit.calls[0]["regions"] == ["BE", "NL"]
    assert store.runs[0]["inference_data_path"] == "runs/proj-1/job-1.nc"


def test_hier_missing_regions_is_permanent_failure():
    bad = _hier_config()
    del bad["regions"]
    store = FakeJobStore(_hier_job(bad))
    fit = make_stub_hier_fit()

    result = run_hier_job(store, FakeStorage({}), "job-1", fit_fn=fit)

    assert result["status"] == "failed"
    assert result["reason"] == "invalid_config"
    assert fit.calls == []


def test_hier_single_region_is_invalid_config():
    cfg = _hier_config()
    del cfg["regions"]["BE"]
    store = FakeJobStore(_hier_job(cfg))

    result = run_hier_job(store, FakeStorage({}), "job-1", fit_fn=make_stub_hier_fit())

    assert result["status"] == "failed"
    assert result["reason"] == "invalid_config"


def test_hier_non_overlapping_regions_fails_as_data_quality():
    # BE's data starts 6 months after NL's -> no shared window across regions.
    files = {
        "nl_rev.csv": _csv("2022-01-03", 84, "revenue", 1000.0),
        "nl_g.csv": _csv("2022-01-03", 84, "spend", 50.0),
        "be_rev.csv": _csv("2022-07-04", 84, "revenue", 800.0),
        "be_g.csv": _csv("2022-07-04", 84, "spend", 40.0),
    }
    store = FakeJobStore(_hier_job(_hier_config()))
    fit = make_stub_hier_fit()

    result = run_hier_job(store, FakeStorage(files), "job-1", fit_fn=fit)

    assert result["status"] == "failed"
    assert result["reason"] == "data_quality"
    assert fit.calls == []
