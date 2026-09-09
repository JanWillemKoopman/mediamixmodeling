"""Run one model run end-to-end, through an explicit state machine.

Shape of the change from v1: there, ``run_job`` marked the job running, downloaded
whatever ``storage_path`` the config named, fitted, and wrote the result. There was no
claim, so a duplicate spawn ran the same fit twice; no prior gate, so a model could start
from an assumption its own data could never produce; and the extra reliability checks were
opt-in and switched on by nothing, so in practice no model was ever scored out of sample.

Here every step is a named state, every transition is a compare-and-set, and the evidence
a model needs in order to be allowed to give budget advice — a held-back window and a
placebo channel — is gathered as part of the run rather than left as an option.

Pure of Supabase and Modal: it talks only to :mod:`mmm_worker.ports`, so the whole
lifecycle is unit-tested with in-memory fakes and no cloud.
"""

from __future__ import annotations

import os
import platform
import tempfile
import traceback

from mmm_worker.jobspec import SpecError, parse_model_config, sanitize_sample
from mmm_worker.ports import ErrorCode, RunState, RunStore, Storage, USER_MESSAGES
from mmm_worker.tables import read_table

# The extra fits that produce out-of-sample evidence run at a lighter budget than the main
# fit: they answer "does this generalise" and "does invented spend earn credit", which are
# yes/no questions, not questions whose answer needs a tight credible interval.
EVIDENCE_SAMPLE = {"draws": 400, "tune": 400, "chains": 2}


class RunCancelled(Exception):
    """Raised when the user asked for the run to stop; not a failure."""


def _netcdf_bytes(idata) -> bytes:
    """Serialize ArviZ InferenceData to netCDF bytes via a temp file."""
    fd, path = tempfile.mkstemp(suffix=".nc")
    os.close(fd)
    try:
        idata.to_netcdf(path)
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        os.unlink(path)


def _package_versions() -> dict:
    """Versions of everything that can change a number, recorded on the run.

    Without this a result is reproducible only by luck: a minor numpyro release can move a
    posterior, and there would be no way to tell that is what happened.
    """
    versions: dict[str, str] = {"python": platform.python_version()}
    for name in ("mmm_core", "pymc", "numpyro", "arviz", "pytensor", "numpy", "pandas", "jax"):
        try:
            module = __import__(name)
            versions[name] = getattr(module, "__version__", "unknown")
        except Exception:
            continue
    return versions


def _classify(exc: BaseException) -> str:
    """Map an exception to a closed error code, so the user never sees a traceback."""
    if isinstance(exc, RunCancelled):
        return ErrorCode.CANCELLED
    if isinstance(exc, SpecError):
        return ErrorCode.CONFIG_INVALID
    if isinstance(exc, MemoryError):
        return ErrorCode.OOM
    if isinstance(exc, TimeoutError):
        return ErrorCode.TIMEOUT
    text = f"{type(exc).__name__}: {exc}".lower()
    if any(k in text for k in ("storage", "download", "upload", "connection", "timed out")):
        return ErrorCode.STORAGE_UNAVAILABLE
    return ErrorCode.INTERNAL


def _gather_evidence(data, config, *, seed: int, log) -> tuple[float | None, float | None]:
    """Fit the model twice more, on questions the main fit cannot answer about itself.

    A held-back window says whether the model generalises; a channel of invented spend says
    whether it credits coincidence. Both were available in v1 and both defaulted to off, so
    the quality gate never actually received either. They are the difference between
    "converged" and "worth acting on", so they run every time.

    A failure in either is reported as "not measured" (``None``) rather than swallowed:
    without the evidence the run simply cannot reach ``usable_for_decisions``, which is the
    honest consequence.
    """
    from mmm_core.evaluation import holdout_mape, placebo_contribution_share

    holdout = None
    placebo = None
    try:
        value = holdout_mape(data, config, sample_kwargs={**EVIDENCE_SAMPLE, "seed": seed})
        holdout = None if value != value else float(value)  # NaN -> not measured
    except Exception as exc:
        log(f"holdout evaluation skipped: {type(exc).__name__}: {exc}")
    try:
        value = placebo_contribution_share(
            data, config, sample_kwargs={**EVIDENCE_SAMPLE, "seed": seed}
        )
        placebo = None if value != value else float(value)
    except Exception as exc:
        log(f"placebo evaluation skipped: {type(exc).__name__}: {exc}")
    return holdout, placebo


def _check_prior_gate(data, config) -> dict:
    """Refuse to spend a fit on priors the data could never produce.

    The cheapest possible check, and the one v1 computed and then ignored: it stored the
    result on the job row for a language model to read as prose. Here it blocks, and the
    review is returned so it can be stored against the configuration either way.
    """
    from dataclasses import asdict

    from mmm_core.evaluation import prior_predictive_check

    result = prior_predictive_check(data, config, draws=300)
    review = {k: (bool(v) if isinstance(v, bool) else float(v)) for k, v in asdict(result).items()}
    if not result.admits_observed:
        raise _PriorGateFailed(
            f"de aannames sluiten je eigen cijfers uit: ze impliceren een KPI tussen "
            f"{result.prior_low:,.0f} en {result.prior_high:,.0f}, terwijl je data tussen "
            f"{result.observed_low:,.0f} en {result.observed_high:,.0f} ligt",
            review,
        )
    if not result.not_absurdly_wide:
        raise _PriorGateFailed(
            "de aannames zijn zo ruim dat het model vrijwel elke uitkomst plausibel vindt; "
            "daarmee zegt het resultaat niets",
            review,
        )
    return review


def _resolve_specification(configuration: dict, data):
    """Turn the stated intent into a runnable specification, here and nowhere else.

    The app stores what the user (or the AI) *meant*, in the closed vocabulary of
    :mod:`mmm_core.model.intent`. Turning that into priors needs measured statistics of the
    actual dataset — the scale of the KPI, each channel's typical weekly pressure, the
    seasonal amplitude actually present — so it has to happen where the data is. Doing it
    in the app would mean a second implementation of the most consequential numbers in the
    product, in a different language, drifting from this one.

    Returns ``(config, spec, provenance, issues)``.
    """
    from mmm_core.model import build_model_config, measure_dataset

    from mmm_worker.jobspec import parse_intent, serialize_model_config, spec_hash

    intent = parse_intent(configuration["intent"])
    stats = measure_dataset(
        data,
        intent.kpi,
        list(intent.channel_names),
        list(intent.control_columns),
    )
    resolved = build_model_config(intent, stats)
    issues = [
        {"code": i.code, "severity": i.severity, "message": i.message, "column": i.column}
        for i in resolved.issues
    ]
    if resolved.has_errors:
        raise SpecError("; ".join(i.message for i in resolved.errors))
    spec = serialize_model_config(resolved.config)
    provenance = [
        {"parameter": p.parameter, "value": p.value, "derived_from": p.derived_from}
        for p in resolved.provenance
    ]
    return resolved.config, spec, spec_hash(spec), provenance, issues


def run_model_run(
    runs: RunStore,
    storage: Storage,
    run_id: str,
    *,
    worker_id: str = "worker",
    fit_fn=None,
    evidence_fn=_gather_evidence,
    prior_gate_fn=_check_prior_gate,
    resolve_fn=_resolve_specification,
    netcdf_bytes=_netcdf_bytes,
    artifact_prefix: str = "runs",
) -> dict:
    """Run one model run. Never raises for a handled failure — the row carries the reason."""
    if fit_fn is None:
        from mmm_core.model.fit import fit_model as fit_fn  # type: ignore

    if not runs.claim(run_id, worker_id):
        # Somebody else already has it. Doing nothing here is the entire idempotency
        # guarantee, so it must stay a plain early return with no writes.
        return {"status": "skipped", "reason": "already_claimed"}

    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    def guard_cancel() -> None:
        if runs.is_cancel_requested(run_id):
            raise RunCancelled()

    run = runs.get_run(run_id)
    project_id = run["project_id"]

    try:
        # --- VALIDATING: is there a dataset to run against? ----------------------
        configuration = runs.get_configuration(run["model_configuration_id"])
        dataset = runs.get_dataset_version(run["dataset_version_id"])
        if dataset.get("status") != "ready":
            raise SpecError("de dataset is nog niet klaar of is mislukt")
        if not dataset.get("master_path"):
            raise SpecError("de dataset heeft geen samengevoegde tabel")
        guard_cancel()

        # --- PREPARING_DATA ------------------------------------------------------
        runs.set_state(run_id, RunState.PREPARING_DATA)
        raw = storage.download(dataset["master_path"])
        data = read_table(dataset["master_path"], raw)
        if data.index.name != "week_start":
            date_col = "week_start" if "week_start" in data.columns else data.columns[0]
            data = data.set_index(date_col)
        import pandas as pd

        data.index = pd.to_datetime(data.index)
        data = data.sort_index()
        guard_cancel()

        # --- BUILDING_MODEL: derive the priors, then gate them -------------------
        runs.set_state(run_id, RunState.BUILDING_MODEL)
        if configuration.get("resolved_spec"):
            # A re-run of an already-resolved configuration reuses the exact same
            # specification, so "same configuration, same data, same seed" really is the
            # same run rather than a fresh derivation that happens to look similar.
            config = parse_model_config(configuration["resolved_spec"])
            resolved_hash = configuration.get("spec_sha256")
        else:
            config, spec, resolved_hash, provenance, issues = resolve_fn(configuration, data)
            runs.save_resolved_spec(
                run["model_configuration_id"],
                spec=spec,
                spec_hash=resolved_hash,
                provenance=provenance,
                issues=issues,
            )
        guard_cancel()

        try:
            review = prior_gate_fn(data, config)
        except _PriorGateFailed as exc:
            runs.record_prior_gate(
                run["model_configuration_id"], review=exc.review, passed=False
            )
            raise
        runs.record_prior_gate(run["model_configuration_id"], review=review or {}, passed=True)
        guard_cancel()

        # --- VALIDATING_MODEL: gather the evidence *before* the main fit ---------
        # Deliberately first. The held-back window and the placebo channel are independent
        # fits on the same data and configuration, so they do not need the main posterior —
        # and running them first means a configuration that cannot even fit a shorter
        # window is found out before the full-budget fit is spent on it. It also means the
        # main fit produces its summary and its verdict in one pass, instead of the model
        # graph being rebuilt afterwards to re-summarise it.
        runs.set_state(run_id, RunState.VALIDATING_MODEL)
        sample = sanitize_sample(run.get("sample_params"))
        seed = int(run.get("seed") or sample.get("seed") or 0)
        sample["seed"] = seed
        holdout, placebo = evidence_fn(data, config, seed=seed, log=log)
        guard_cancel()

        # --- SAMPLING ------------------------------------------------------------
        runs.set_state(run_id, RunState.SAMPLING)
        try:
            summary, idata = fit_fn(
                data, config, holdout_mape=holdout, placebo_share=placebo, **sample
            )
        except SpecError:
            raise
        except Exception as exc:  # a sampler failure is its own, non-retryable category
            # Keep the exception type in the message: "'google_spend'" alone tells the
            # builder nothing, while "KeyError: 'google_spend'" points straight at a column
            # the configuration names and the master table does not have.
            raise _SamplingFailed(f"{type(exc).__name__}: {exc}") from exc
        runs.heartbeat(run_id)
        guard_cancel()

        # --- CALCULATING_RESULTS -------------------------------------------------
        runs.set_state(run_id, RunState.CALCULATING_RESULTS)
        payload = summary.to_json_dict()
        runs.save_diagnostics(
            run_id,
            {
                "convergence": {
                    "max_r_hat": summary.diagnostics.max_r_hat,
                    "min_ess_bulk": summary.diagnostics.min_ess_bulk,
                    "min_ess_tail": summary.diagnostics.min_ess_tail,
                    "n_divergences": summary.diagnostics.n_divergences,
                    "min_e_bfmi": summary.diagnostics.min_e_bfmi,
                    "n_max_treedepth": summary.diagnostics.n_max_treedepth,
                },
                "fit": {
                    "r2": summary.diagnostics.r2,
                    "mape": summary.diagnostics.mape,
                    "interval_coverage_94": summary.diagnostics.interval_coverage_94,
                    "interval_coverage_80": summary.diagnostics.interval_coverage_80,
                    "interval_coverage_50": summary.diagnostics.interval_coverage_50,
                    "residual_autocorrelation": summary.diagnostics.residual_autocorrelation,
                    "decomposition_ok": summary.diagnostics.decomposition_ok,
                },
                "identifiability": payload.get("identifiability"),
                "out_of_sample": {"holdout_mape": holdout},
                "placebo": {"contribution_share": placebo},
            },
        )
        if summary.validation is not None:
            runs.save_validation(run_id, summary.validation.to_json_dict())

        # The heavy trace goes to Storage. If that upload fails the run still completes —
        # but the omission is recorded rather than silently swallowed, because a result
        # without its trace can never be re-analysed and the user deserves to know.
        artifact_path: str | None = None
        try:
            artifact_path = f"{artifact_prefix}/{project_id}/{run_id}.nc"
            storage.upload(artifact_path, netcdf_bytes(idata), "application/x-netcdf")
        except Exception as exc:
            artifact_path = None
            log(f"trace not stored: {type(exc).__name__}: {exc}")

        runs.save_results(run_id, project_id, payload, artifact_path)
        runs.mark_completed(
            run_id,
            provenance={
                "dataset_sha256": dataset.get("master_sha256"),
                "spec_sha256": resolved_hash,
                "seed": seed,
                "sample_params": sample,
                "package_versions": _package_versions(),
                "worker_image_digest": os.environ.get("MODAL_IMAGE_ID"),
                "log_tail": "\n".join(log_lines[-50:]) or None,
            },
        )
        return {
            "status": "succeeded",
            "run_id": run_id,
            "level": summary.validation.level.value if summary.validation else None,
            "inference_data_path": artifact_path,
        }

    except RunCancelled:
        runs.mark_failed(
            run_id,
            code=ErrorCode.CANCELLED,
            user_message=USER_MESSAGES[ErrorCode.CANCELLED],
            technical="cancelled by user request",
            retryable=False,
        )
        return {"status": "cancelled", "run_id": run_id}

    except _SamplingFailed as exc:
        runs.mark_failed(
            run_id,
            code=ErrorCode.SAMPLING_FAILED,
            user_message=USER_MESSAGES[ErrorCode.SAMPLING_FAILED],
            technical=f"{exc}\n{traceback.format_exc(limit=8)}",
            retryable=False,
        )
        return {"status": "failed", "run_id": run_id, "code": ErrorCode.SAMPLING_FAILED}

    except SpecError as exc:
        # A prior-gate refusal is a specification problem, but it deserves its own code so
        # the app can send the user back to the tuning step rather than to the data step.
        code = (
            ErrorCode.PRIOR_GATE_FAILED
            if isinstance(exc, _PriorGateFailed)
            else ErrorCode.CONFIG_INVALID
        )
        runs.mark_failed(
            run_id,
            code=code,
            user_message=f"{USER_MESSAGES[code]}\n\n{exc}",
            technical=str(exc),
            retryable=False,
        )
        return {"status": "failed", "run_id": run_id, "code": code}

    except Exception as exc:
        code = _classify(exc)
        runs.mark_failed(
            run_id,
            code=code,
            user_message=USER_MESSAGES[code],
            technical=f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=8)}",
            retryable=code in ErrorCode.RETRYABLE,
        )
        return {"status": "failed", "run_id": run_id, "code": code}


class _SamplingFailed(Exception):
    """The sampler itself failed. Retrying an identical configuration will fail again."""


class _PriorGateFailed(SpecError):
    """The priors do not admit the observed data. Carries the review so it can be stored."""

    def __init__(self, message: str, review: dict):
        super().__init__(message)
        self.review = review
