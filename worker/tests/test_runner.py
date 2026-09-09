"""The model-run lifecycle, without Supabase, Modal or a sampler.

Each test here corresponds to a failure the audit found in the v1 worker:

* a job could be claimed and run twice, producing two results for one job;
* a run could reach the sampler on priors its own data could never produce;
* a raw Python traceback was written to a field the user reads;
* a transient storage blip was a permanent failure;
* the out-of-sample evidence existed but was opt-in and never switched on.
"""

from __future__ import annotations

import pandas as pd
import pytest

from mmm_worker.jobspec import serialize_model_config
from mmm_worker.ports import ErrorCode, RunState
from mmm_worker.runner import RunCancelled, run_model_run
from tests.fakes import (
    FakeRunStore,
    FakeStorage,
    StubSummary,
    make_stub_evidence,
    make_stub_fit,
    make_stub_resolver,
    no_prior_gate,
)

MASTER_CSV = (
    "week_start,revenue,search\n"
    + "".join(
        f"2024-{1 + i // 28:02d}-{1 + i % 28:02d},{1000 + i * 3},{100 + i}\n" for i in range(40)
    )
)


def _spec():
    from mmm_core.model import ChannelConfig, ChannelUnit, ModelConfig

    return serialize_model_config(
        ModelConfig(
            kpi="revenue",
            channels=(ChannelConfig("search", unit=ChannelUnit.CURRENCY),),
        )
    )


def _intent():
    from mmm_core.model import ChannelIntent, ChannelUnit, KpiType, ModelIntent

    from mmm_worker.jobspec import serialize_intent

    return serialize_intent(
        ModelIntent(
            kpi="revenue",
            kpi_type=KpiType.REVENUE,
            channels=(ChannelIntent("search", ChannelUnit.CURRENCY),),
        )
    )


def _store(**run_overrides):
    run = {
        "id": "run-1",
        "project_id": "proj-1",
        "model_configuration_id": "cfg-1",
        "dataset_version_id": "ds-1",
        "state": RunState.QUEUED,
        "seed": 7,
        "sample_params": {"draws": 500, "tune": 500, "chains": 2},
        **run_overrides,
    }
    return FakeRunStore(
        run=run,
        configuration={"id": "cfg-1", "intent": _intent(), "resolved_spec": None},
        dataset={
            "id": "ds-1",
            "status": "ready",
            "master_path": "datasets/proj-1/ds-1.csv",
            "master_sha256": "data-hash",
        },
    )


def _storage(**kw):
    return FakeStorage({"datasets/proj-1/ds-1.csv": MASTER_CSV.encode()}, **kw)


def _run(store, storage=None, **kw):
    kw.setdefault("fit_fn", make_stub_fit())
    kw.setdefault("evidence_fn", make_stub_evidence())
    kw.setdefault("prior_gate_fn", no_prior_gate)
    kw.setdefault("resolve_fn", make_stub_resolver())
    return run_model_run(store, storage or _storage(), "run-1", **kw)


# --- the happy path -----------------------------------------------------------------


def test_a_run_walks_the_whole_state_machine():
    store = _store()
    result = _run(store)
    assert result["status"] == "succeeded"
    assert store.states == [
        RunState.VALIDATING,
        RunState.PREPARING_DATA,
        RunState.BUILDING_MODEL,
        RunState.VALIDATING_MODEL,
        RunState.SAMPLING,
        RunState.CALCULATING_RESULTS,
        RunState.COMPLETED,
    ]


def test_everything_needed_to_reproduce_the_run_is_recorded():
    """v1 recorded none of this, so a published number could not be traced to its inputs."""
    store = _store()
    _run(store)
    p = store.completed
    assert p["dataset_sha256"] == "data-hash"
    assert p["spec_sha256"] == "derived-hash"
    assert p["seed"] == 7
    assert p["sample_params"]["draws"] == 500
    assert "mmm_core" in p["package_versions"]
    assert "python" in p["package_versions"]


def test_results_diagnostics_and_validation_are_stored_separately():
    store = _store()
    _run(store)
    assert store.results["project_id"] == "proj-1"
    assert store.diagnostics["convergence"]["max_r_hat"] == 1.0
    assert store.diagnostics["out_of_sample"] == {"holdout_mape": 0.12}
    assert store.diagnostics["placebo"] == {"contribution_share": 0.01}
    assert store.validation["level"] == "statistically_valid"


def test_the_trace_is_uploaded_to_storage():
    store = _store()
    storage = _storage()
    result = _run(store, storage)
    assert result["inference_data_path"] == "runs/proj-1/run-1.nc"
    assert "runs/proj-1/run-1.nc" in storage.uploads


# --- idempotency: the bug that ran some fits twice ------------------------------------


def test_a_second_container_for_the_same_run_does_nothing():
    """The whole idempotency guarantee: the loser of the claim writes nothing at all."""
    store = _store()
    _run(store)
    before = (store.results, store.completed, len(store.states))

    fit = make_stub_fit()
    second = _run(store, fit_fn=fit)

    assert second == {"status": "skipped", "reason": "already_claimed"}
    assert fit.calls == [], "the second container ran the fit anyway"
    assert (store.results, store.completed, len(store.states)) == before


def test_a_run_that_is_not_queued_is_never_claimed():
    store = _store(state=RunState.SAMPLING)
    fit = make_stub_fit()
    assert _run(store, fit_fn=fit)["status"] == "skipped"
    assert fit.calls == []


# --- the prior gate, which v1 computed and then ignored --------------------------------


def test_priors_that_exclude_the_observed_kpi_stop_the_run_before_sampling():
    from mmm_worker.runner import _PriorGateFailed

    def refusing_gate(data, config):
        raise _PriorGateFailed(
            "de aannames sluiten je eigen cijfers uit: ze impliceren een KPI tussen 1 en 2",
            {"admits_observed": False, "ok": False},
        )

    store = _store()
    fit = make_stub_fit()
    result = _run(store, prior_gate_fn=refusing_gate, fit_fn=fit)

    assert result["code"] == ErrorCode.PRIOR_GATE_FAILED
    assert fit.calls == [], "compute was spent on a model the priors had already ruled out"
    assert store.run["state"] == RunState.FAILED
    # The user is sent to the tuning step, and told what the mismatch was.
    assert "afstemming" in store.failure["user_message"]
    assert "impliceren een KPI" in store.failure["user_message"]
    # The review is stored even on the failing path, so the user can see the mismatch.
    assert store.prior_gate == {
        "review": {"admits_observed": False, "ok": False}, "passed": False
    }


# --- evidence gathering ----------------------------------------------------------------


def test_the_evidence_reaches_the_fit_so_it_can_reach_the_top_rung():
    store = _store()
    fit = make_stub_fit()
    _run(store, fit_fn=fit, evidence_fn=make_stub_evidence(holdout=0.09, placebo=0.002))
    assert fit.calls[0]["holdout_mape"] == 0.09
    assert fit.calls[0]["placebo_share"] == 0.002


def test_evidence_runs_before_the_main_fit():
    """A configuration that cannot fit a shorter window should not cost a full-budget fit."""
    order: list[str] = []

    def evidence(data, config, *, seed, log):
        order.append("evidence")
        return 0.1, 0.01

    def fit(data, config, **kw):
        order.append("fit")
        return StubSummary(), _Idata()

    class _Idata:
        def to_netcdf(self, path):
            open(path, "wb").write(b"x")

    _run(_store(), fit_fn=fit, evidence_fn=evidence)
    assert order == ["evidence", "fit"]


def test_unmeasurable_evidence_is_passed_as_none_not_faked():
    store = _store()
    fit = make_stub_fit()
    _run(store, fit_fn=fit, evidence_fn=make_stub_evidence(holdout=None, placebo=None))
    assert fit.calls[0]["holdout_mape"] is None
    assert store.diagnostics["out_of_sample"] == {"holdout_mape": None}


# --- failures ---------------------------------------------------------------------------


def test_a_sampler_failure_is_not_retried():
    """An identical configuration will diverge identically; retrying only burns compute."""
    store = _store()
    result = _run(store, fit_fn=make_stub_fit(raises=RuntimeError("chains did not converge")))
    assert result["code"] == ErrorCode.SAMPLING_FAILED
    assert store.failure["retryable"] is False
    assert store.run["state"] == RunState.FAILED
    assert store.requeued is False


def test_a_storage_failure_is_retried():
    store = _store()
    result = run_model_run(
        store,
        FakeStorage({}),  # the master is missing -> download raises
        "run-1",
        fit_fn=make_stub_fit(),
        evidence_fn=make_stub_evidence(),
        prior_gate_fn=no_prior_gate,
    )
    assert result["code"] == ErrorCode.STORAGE_UNAVAILABLE
    assert store.failure["retryable"] is True
    assert store.requeued is True
    assert store.run["state"] == RunState.QUEUED


def test_a_retry_is_bounded_by_max_attempts():
    store = _store()
    store.run["attempt"] = 2  # the claim will make it 3, past max_attempts=2
    run_model_run(
        store, FakeStorage({}), "run-1",
        fit_fn=make_stub_fit(), evidence_fn=make_stub_evidence(), prior_gate_fn=no_prior_gate,
    )
    assert store.run["state"] == RunState.FAILED
    assert store.requeued is False


def test_the_user_never_sees_a_traceback():
    """v1 wrote `f"{type(exc).__name__}: {exc}"` into the field the wizard renders."""
    store = _store()
    _run(store, fit_fn=make_stub_fit(raises=KeyError("google_spend")))
    assert "KeyError" not in store.failure["user_message"]
    assert "Traceback" not in store.failure["user_message"]
    # ... while the builder can still see exactly what happened.
    assert "KeyError" in store.failure["technical"]


def test_a_dataset_that_is_not_ready_is_refused():
    store = _store()
    store.dataset["status"] = "failed"
    result = _run(store)
    assert result["code"] == ErrorCode.CONFIG_INVALID
    assert store.run["state"] == RunState.FAILED


def test_a_corrupt_specification_fails_permanently():
    store = _store()
    store.configuration["resolved_spec"] = {"kpi": "revenue"}  # no channels
    result = _run(store)
    assert result["code"] == ErrorCode.CONFIG_INVALID
    assert store.failure["retryable"] is False


# --- prior derivation happens here, once ---------------------------------------------


def test_the_specification_is_derived_from_intent_and_stored_with_its_provenance():
    """The app stores what the user meant; the worker computes what it means for this data."""
    store = _store()
    _run(store)
    assert store.resolved is not None
    assert store.configuration["spec_sha256"] == "derived-hash"


def test_an_already_resolved_configuration_is_reused_verbatim():
    """A re-run must be the same run, not a fresh derivation that happens to look similar."""
    store = _store()
    store.configuration["resolved_spec"] = _spec()
    store.configuration["spec_sha256"] = "earlier-hash"
    resolver = make_stub_resolver()
    _run(store, resolve_fn=resolver)
    assert resolver.calls == [], "the stored specification was re-derived instead of reused"
    assert store.completed["spec_sha256"] == "earlier-hash"


def test_the_prior_review_is_stored_whether_it_passes_or_fails():
    store = _store()
    _run(store)
    assert store.prior_gate == {
        "review": {"admits_observed": True, "not_absurdly_wide": True, "ok": True},
        "passed": True,
    }


# --- cancellation -------------------------------------------------------------------------


def test_a_cancelled_run_stops_and_says_so():
    store = _store()
    store.run["cancel_requested"] = True
    fit = make_stub_fit()
    result = _run(store, fit_fn=fit)
    assert result["status"] == "cancelled"
    assert store.run["state"] == RunState.CANCELLED
    assert fit.calls == []
    assert "gestopt" in store.failure["user_message"]


# --- the trace is a bonus, never a reason to lose a result -----------------------------


def test_a_failed_trace_upload_still_completes_but_records_the_omission():
    """Without its trace a result can never be re-analysed, so silence is not acceptable."""
    store = _store()
    result = _run(store, _storage(fail_upload=True))
    assert result["status"] == "succeeded"
    assert result["inference_data_path"] is None
    assert "trace not stored" in store.completed["log_tail"]
