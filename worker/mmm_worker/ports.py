"""Dependency ports for the worker orchestration.

The orchestration in :mod:`mmm_worker.runner` and :mod:`mmm_worker.prepare` depends only
on these small interfaces, so the whole lifecycle — claiming, state transitions, failure
handling, persistence — is unit-tested with in-memory fakes and knows nothing about
Supabase or Modal. Concrete Supabase-backed implementations live in
:mod:`mmm_worker.supabase_backends`.
"""

from __future__ import annotations

from typing import Protocol


class RunState:
    """The states a model run moves through. One writer (the worker), one direction.

    Every transition goes through a compare-and-set on the previous state, so a duplicate
    spawn cannot run the same fit twice — the v1 code marked a job 'running' unconditionally
    and its one-minute poll re-spawned everything still queued.
    """

    QUEUED = "queued"
    VALIDATING = "validating"
    PREPARING_DATA = "preparing_data"
    BUILDING_MODEL = "building_model"
    SAMPLING = "sampling"
    VALIDATING_MODEL = "validating_model"
    CALCULATING_RESULTS = "calculating_results"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

    TERMINAL = frozenset({COMPLETED, FAILED, CANCELLED})
    #: In order, so a caller can show "step 3 of 7" without hard-coding the list.
    SEQUENCE = (
        QUEUED, VALIDATING, PREPARING_DATA, BUILDING_MODEL,
        SAMPLING, VALIDATING_MODEL, CALCULATING_RESULTS, COMPLETED,
    )


class ErrorCode:
    """Closed set of failure reasons. Each maps to one fixed user-facing sentence and to a
    retry decision — a raw Python exception must never reach a user, and must never be the
    thing that decides whether we spend another five minutes of compute."""

    DATA_QUALITY = "DATA_QUALITY"
    CONFIG_INVALID = "CONFIG_INVALID"
    PRIOR_GATE_FAILED = "PRIOR_GATE_FAILED"
    SAMPLING_FAILED = "SAMPLING_FAILED"
    TIMEOUT = "TIMEOUT"
    OOM = "OOM"
    STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE"
    CANCELLED = "CANCELLED"
    INTERNAL = "INTERNAL"

    #: Transient infrastructure problems are worth another attempt. A model that diverged
    #: will diverge again with the same configuration, so retrying it just burns compute
    #: and delays the moment the user finds out something has to change.
    RETRYABLE = frozenset({STORAGE_UNAVAILABLE, TIMEOUT, OOM, INTERNAL})


#: What the user is told, per failure. Written for a marketer, with a next step.
USER_MESSAGES: dict[str, str] = {
    ErrorCode.DATA_QUALITY: (
        "De data die je hebt aangeleverd kan zo niet gebruikt worden. Hieronder staat wat "
        "er niet klopt; pas het aan en probeer het opnieuw."
    ),
    ErrorCode.CONFIG_INVALID: (
        "De modelinstellingen zijn niet geldig. Ga terug naar de afstemstap en laat de "
        "instellingen opnieuw bepalen."
    ),
    ErrorCode.PRIOR_GATE_FAILED: (
        "De verwachtingen die aan het model zijn meegegeven passen niet bij je data — het "
        "model zou beginnen met een aanname die je cijfers nooit kunnen opleveren. Pas de "
        "afstemming aan voordat er gerekend wordt."
    ),
    ErrorCode.SAMPLING_FAILED: (
        "De berekening is niet tot een stabiel antwoord gekomen. Meestal helpt het om een "
        "kanaal samen te voegen of weg te laten, of om een langere periode te gebruiken."
    ),
    ErrorCode.TIMEOUT: (
        "De berekening duurde langer dan toegestaan en is afgebroken. Probeer het opnieuw "
        "met minder kanalen, of neem contact op als dit blijft gebeuren."
    ),
    ErrorCode.OOM: (
        "De berekening had meer geheugen nodig dan beschikbaar was. Probeer het met minder "
        "kanalen of een kortere periode."
    ),
    ErrorCode.STORAGE_UNAVAILABLE: (
        "De opslag was even niet bereikbaar. We proberen het automatisch opnieuw."
    ),
    ErrorCode.CANCELLED: "De berekening is op jouw verzoek gestopt.",
    ErrorCode.INTERNAL: (
        "Er ging iets mis aan onze kant. We proberen het automatisch opnieuw; blijft het "
        "misgaan, neem dan contact op."
    ),
}


class RunStore(Protocol):
    """Persistence for a model run's lifecycle."""

    def get_run(self, run_id: str) -> dict:
        """The run row: id, project_id, model_configuration_id, dataset_version_id,
        seed, sample_params, attempt, max_attempts, cancel_requested."""

    def claim(self, run_id: str, worker: str) -> bool:
        """Compare-and-set ``queued -> validating``. ``False`` means somebody else has it,
        and the caller must return without any side effects."""

    def set_state(self, run_id: str, state: str) -> None:
        """Advance to the next state and refresh the heartbeat."""

    def heartbeat(self, run_id: str) -> None:
        """Say the container is still alive. The reaper uses this, not ``started_at``, so a
        long but healthy fit is never mistaken for a dead one."""

    def is_cancel_requested(self, run_id: str) -> bool: ...

    def mark_completed(self, run_id: str, *, provenance: dict) -> None:
        """Finish successfully, recording everything needed to reproduce the run."""

    def mark_failed(
        self, run_id: str, *, code: str, user_message: str, technical: str, retryable: bool
    ) -> None:
        """Finish with a failure, or return the run to the queue when a retry is left."""

    def get_configuration(self, configuration_id: str) -> dict: ...

    def get_dataset_version(self, dataset_version_id: str) -> dict: ...

    def save_diagnostics(self, run_id: str, diagnostics: dict) -> None: ...

    def save_validation(self, run_id: str, validation: dict) -> None: ...

    def save_results(
        self, run_id: str, project_id: str, summary: dict, inference_data_path: str | None
    ) -> None: ...


class DatasetStore(Protocol):
    """Persistence for building one dataset version."""

    def get_dataset_version(self, dataset_id: str) -> dict: ...

    def claim(self, dataset_id: str, worker: str) -> bool: ...

    def heartbeat(self, dataset_id: str) -> None: ...

    def storage_paths(self, project_id: str) -> dict[str, str]:
        """``source_file_id -> storage_path`` for *this project only*.

        The recipe carries ids, never paths. Resolving them here — against the project the
        dataset belongs to — is what makes it impossible for a recipe to reach a file in
        another project, which the v1 client-supplied ``storage_path`` allowed.
        """

    def mark_ready(self, dataset_id: str, **fields) -> None: ...

    def mark_failed(self, dataset_id: str, *, code: str, user_message: str, technical: str) -> None: ...


class Storage(Protocol):
    def download(self, path: str) -> bytes: ...

    def upload(self, path: str, data: bytes, content_type: str) -> None: ...
