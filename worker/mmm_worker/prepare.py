"""Build one dataset version: download the sources, merge, check, and hash the result.

This is the step before any modelling: the recipe the builder assembled (which files,
which column is which role, how to handle gaps and events) run through the frozen mmm-core
ingestion, producing one aligned weekly master table.

Two changes from v1. The recipe now carries *source file ids*, and the storage paths are
resolved here from the rows of this project — so a recipe can no longer name a file
somewhere else, which the client-supplied path used to allow. And the merged table is
hashed: that hash is what a model run records, so "which data is this result based on" has
an answer that survives anything anyone does to the project afterwards.
"""

from __future__ import annotations

import hashlib
import traceback

import numpy as np
import pandas as pd

from mmm_core import build_master_dataset, validate_columns

from mmm_worker.jobspec import SpecError, parse_prepare_recipe, source_transforms_map
from mmm_worker.ports import DatasetStore, ErrorCode, Storage, USER_MESSAGES
from mmm_worker.tables import read_table

_PREVIEW_ROWS = 6


def _suitability(report, extra_issues: list | None = None) -> dict:
    """The quality report, structured so the app can show cause *and* next step per issue."""
    return {
        "issues": [
            {
                "code": i.code,
                "severity": i.severity.value,
                "message": i.message,
                "source": i.source,
                "details": i.details,
            }
            for i in report
        ]
        + list(extra_issues or [])
    }


def _verdict(report, extra_issues: list | None = None) -> str:
    extra = list(extra_issues or [])
    if report.has_errors or any(i["severity"] == "error" for i in extra):
        return "not_usable"
    return "usable_with_warnings" if report.warnings or extra else "usable"


def _rows(frame: pd.DataFrame) -> list[dict]:
    """JSON-safe records with the week label first (NaN -> None)."""
    out: list[dict] = []
    for ts, row in frame.iterrows():
        rec: dict = {"week_start": pd.Timestamp(ts).date().isoformat()}
        for col, val in row.items():
            rec[str(col)] = None if pd.isna(val) else float(val)
        out.append(rec)
    return out


def _preview(data: pd.DataFrame, column_roles: dict) -> dict:
    """A compact, JSON-serializable snapshot of the merged master for the app."""
    summary = {}
    for col in data.columns:
        s = pd.to_numeric(data[col], errors="coerce")
        clean = s.dropna()
        summary[str(col)] = {
            "role": column_roles.get(col),
            "n_missing": int(s.isna().sum()),
            "min": None if clean.empty else float(clean.min()),
            "max": None if clean.empty else float(clean.max()),
            "mean": None if clean.empty else float(clean.mean()),
        }
    return {
        "columns": [{"name": str(c), "role": column_roles.get(c)} for c in data.columns],
        "n_weeks": int(len(data)),
        "head": _rows(data.head(_PREVIEW_ROWS)),
        "tail": _rows(data.tail(_PREVIEW_ROWS)),
        "summary": summary,
    }


# Findings that are a plain statement about the values, not a heuristic. Only these stop a
# build. `looks_like_identifier` is deliberately not here: it is a good hint and a bad gate —
# a KPI that happens to rise every single week trips it, and a user staring at step 4 has no
# way to overrule it. Those arrive as warnings in the quality report instead.
_BLOCKING_ROLE_CODES = frozenset(
    {
        "column_missing",
        "not_numeric",
        "date_does_not_parse",
        "negative_spend",
        "all_zero_channel",
        "binary_column_as_spend",
        "constant_control",
        "kpi_not_positive",
        "kpi_barely_varies",
    }
)


def _validate_declared_roles(frames) -> list:
    """Run the column validation over each raw source before anything is aggregated.

    `validate_columns` has existed in mmm-core since the refactor and was never called from
    anywhere: the roles are decided in the web step, which is TypeScript, and the worker went
    straight from recipe to `build_master_dataset`. So an entire layer of checks — an order
    id proposed as a channel, a constant control, a KPI with nothing to explain, a 0/1
    campaign flag booked as media pressure — sat there judging nothing.

    Here is the first point where the declared roles and the raw values meet in one process,
    so this is where it belongs. Structural checks stay off: they ask whether the set as a
    whole has a date, a KPI and channels, and one source of a multi-file model legitimately
    holds only some of those. That question is already answered by the merge itself.
    """
    issues = []
    for spec, frame in frames:
        roles = {col.name: col.role.value for col in spec.columns if col.name in frame.columns}
        if spec.date_column and spec.date_column in frame.columns:
            roles[spec.date_column] = "date"
        if not roles:
            continue
        for finding in validate_columns(frame, roles, include_structural=False).findings:
            blocking = finding.severity == "blocking" and finding.code in _BLOCKING_ROLE_CODES
            issues.append(
                {
                    "code": finding.code,
                    "severity": "error" if blocking else "warning",
                    "message": finding.message,
                    "source": spec.name,
                    "details": {
                        "column": finding.column,
                        **(
                            {"suggested_role": finding.suggested_role.value}
                            if finding.suggested_role is not None
                            else {}
                        ),
                    },
                }
            )
    return issues


def build_dataset_version(
    datasets: DatasetStore,
    storage: Storage,
    dataset_id: str,
    *,
    worker_id: str = "worker",
    artifact_prefix: str = "datasets",
) -> dict:
    """Build one dataset version end-to-end. Never raises for a handled failure."""
    if not datasets.claim(dataset_id, worker_id):
        return {"status": "skipped", "reason": "already_claimed"}

    row = datasets.get_dataset_version(dataset_id)
    project_id = row["project_id"]

    try:
        paths = datasets.storage_paths(project_id)
        spec = parse_prepare_recipe(row.get("recipe") or {}, paths)

        frames = []
        for ref in spec.sources:
            raw = storage.download(ref.storage_path)
            frames.append((ref.spec, read_table(ref.storage_path, raw)))
        datasets.heartbeat(dataset_id)

        # Before building, not after: a role that cannot hold is a fact about the upload,
        # and merging four years of weeks to discover it wastes the work and reports the
        # same problem twice (mmm_core.ingestion keeps its own fallback check for callers
        # that never came through here).
        role_issues = _validate_declared_roles(frames)
        blocking_roles = [i for i in role_issues if i["severity"] == "error"]
        if blocking_roles:
            reason = "; ".join(i["message"] for i in blocking_roles)
            datasets.mark_failed(
                dataset_id,
                code=ErrorCode.DATA_QUALITY,
                user_message=f"{USER_MESSAGES[ErrorCode.DATA_QUALITY]}\n\n{reason}",
                technical=reason,
            )
            return {
                "status": "failed",
                "code": ErrorCode.DATA_QUALITY,
                "suitability": {"issues": role_issues},
            }

        build = build_master_dataset(
            frames,
            event_dummies=list(spec.event_dummies),
            features=list(spec.features),
            source_transforms=source_transforms_map(spec.sources),
        )
        suitability = _suitability(build.report, role_issues)

        if build.report.has_errors or build.window is None:
            reason = "; ".join(i.message for i in build.report.errors) or "geen overlappende periode"
            datasets.mark_failed(
                dataset_id,
                code=ErrorCode.DATA_QUALITY,
                user_message=f"{USER_MESSAGES[ErrorCode.DATA_QUALITY]}\n\n{reason}",
                technical=reason,
            )
            return {"status": "failed", "code": ErrorCode.DATA_QUALITY, "suitability": suitability}

        column_roles = {
            name: role.value
            for name, role in build.column_roles.items()
            if name in build.data.columns
        }
        csv_bytes = build.data.to_csv().encode()
        master_path = f"{artifact_prefix}/{project_id}/{dataset_id}.csv"
        storage.upload(master_path, csv_bytes, "text/csv")

        datasets.mark_ready(
            dataset_id,
            master_path=master_path,
            # The content hash is what makes this version immutable in practice: a run
            # records it, so a later result can always be traced back to exactly this table.
            master_sha256=hashlib.sha256(csv_bytes).hexdigest(),
            window_start=build.window[0].date().isoformat(),
            window_end=build.window[1].date().isoformat(),
            n_weeks=int(len(build.data)),
            frequency="weekly",
            column_roles=column_roles,
            suitability=suitability,
            verdict=_verdict(build.report, role_issues),
            preview=_preview(build.data, column_roles),
        )
        return {"status": "ready", "dataset_id": dataset_id, "master_path": master_path}

    except SpecError as exc:
        datasets.mark_failed(
            dataset_id,
            code=ErrorCode.CONFIG_INVALID,
            user_message=f"{USER_MESSAGES[ErrorCode.CONFIG_INVALID]}\n\n{exc}",
            technical=str(exc),
        )
        return {"status": "failed", "code": ErrorCode.CONFIG_INVALID}

    except Exception as exc:
        text = f"{type(exc).__name__}: {exc}".lower()
        code = (
            ErrorCode.STORAGE_UNAVAILABLE
            if any(k in text for k in ("storage", "download", "upload", "connection"))
            else ErrorCode.INTERNAL
        )
        datasets.mark_failed(
            dataset_id,
            code=code,
            user_message=USER_MESSAGES[code],
            technical=f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=8)}",
        )
        return {"status": "failed", "code": code}
