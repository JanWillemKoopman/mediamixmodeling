"""Structured data-quality reporting.

The ingestion pipeline never silently mutates data on a hunch: anything suspicious
becomes a :class:`QualityIssue` on the returned :class:`QualityReport`, so the builder
(and later Claude) can decide what to do about it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Severity(str, Enum):
    INFO = "info"        # something we did automatically and want to be transparent about
    WARNING = "warning"  # likely fine, but the builder should look
    ERROR = "error"      # the result cannot be trusted / is unusable as-is


@dataclass
class QualityIssue:
    code: str
    severity: Severity
    message: str
    source: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        where = f"[{self.source}] " if self.source else ""
        return f"{self.severity.value.upper()}: {where}{self.message}"


@dataclass
class QualityReport:
    issues: list[QualityIssue] = field(default_factory=list)

    def add(
        self,
        code: str,
        severity: Severity,
        message: str,
        *,
        source: str | None = None,
        **details: Any,
    ) -> QualityIssue:
        issue = QualityIssue(
            code=code,
            severity=severity,
            message=message,
            source=source,
            details=details,
        )
        self.issues.append(issue)
        return issue

    def _by(self, severity: Severity) -> list[QualityIssue]:
        return [i for i in self.issues if i.severity is severity]

    @property
    def infos(self) -> list[QualityIssue]:
        return self._by(Severity.INFO)

    @property
    def warnings(self) -> list[QualityIssue]:
        return self._by(Severity.WARNING)

    @property
    def errors(self) -> list[QualityIssue]:
        return self._by(Severity.ERROR)

    @property
    def has_errors(self) -> bool:
        return bool(self.errors)

    def codes(self) -> set[str]:
        return {i.code for i in self.issues}

    def __iter__(self):
        return iter(self.issues)

    def __len__(self) -> int:
        return len(self.issues)

    def __str__(self) -> str:
        if not self.issues:
            return "QualityReport: clean"
        return "QualityReport:\n" + "\n".join(f"  - {i}" for i in self.issues)
