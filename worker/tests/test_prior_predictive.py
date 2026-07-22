"""Unit tests for the prior-predictive review job (worker/mmm_worker/prior_predictive.py).

Uses in-memory fakes and a stub check function, so it runs without the heavy PyMC stack —
the real prior_predictive_check is exercised by mmm-core's own tests. These tests pin the
worker orchestration: config parse -> master build -> check -> review persisted on the job.
"""

from dataclasses import dataclass

import pandas as pd

from fakes import FakeJobStore, FakeStorage
from mmm_worker.prior_predictive import run_prior_predictive


def _csv(start, periods, col, value):
    dates = pd.date_range(start, periods=periods, freq="W-MON")
    return pd.DataFrame({"date": dates, col: value}).to_csv(index=False).encode()


def _config():
    return {
        "sources": [
            {"name": "revenue", "storage_path": "rev.csv", "date_column": "date",
             "columns": [{"name": "revenue", "role": "kpi"}]},
            {"name": "google", "storage_path": "g.csv", "date_column": "date",
             "columns": [{"name": "spend", "role": "spend", "output_name": "google_spend"}]},
        ],
        "model": {
            "kpi": "revenue",
            "channels": [{"name": "google_spend", "channel_type": "intent"}],
        },
    }


def _job(config, job_id="job-1", project_id="proj-1"):
    return {"id": job_id, "project_id": project_id, "type": "prior_predictive", "config": config}


@dataclass
class _StubResult:
    observed_low: float
    observed_high: float
    prior_low: float
    prior_high: float
    admits_observed: bool
    not_absurdly_wide: bool
    ok: bool


def test_prior_predictive_persists_review_on_success():
    files = {"rev.csv": _csv("2022-01-03", 60, "revenue", 1000.0),
             "g.csv": _csv("2022-01-03", 60, "spend", 50.0)}
    store = FakeJobStore(_job(_config()))

    captured = {}

    def stub_check(data, model):
        captured["kpi"] = model.kpi
        captured["n"] = len(data)
        return _StubResult(900.0, 1100.0, 800.0, 1200.0, True, True, True)

    result = run_prior_predictive(store, FakeStorage(files), "job-1", check_fn=stub_check)

    assert result["status"] == "succeeded"
    assert store.status == "succeeded"
    assert store.prior_predictive is not None
    assert store.prior_predictive["ok"] is True
    assert store.prior_predictive["prior_low"] == 800.0
    assert captured["kpi"] == "revenue"


def test_prior_predictive_invalid_config_fails_cleanly():
    store = FakeJobStore(_job({"sources": [], "model": {}}))
    result = run_prior_predictive(store, FakeStorage({}), "job-1", check_fn=lambda d, m: None)
    assert result["status"] == "failed"
    assert store.status == "failed"
    assert store.prior_predictive is None
