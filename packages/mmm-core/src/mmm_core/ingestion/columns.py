"""Deterministic column validation: can this column play the role it was assigned?

Column roles decide what the model *is* — which column is the target, which are the
channels. In v1 that decision came entirely from a language model looking at fifteen preview
rows, and the only validation was that the returned strings were valid enum values: nothing
checked that a "spend" column was numeric, that a "date" column parsed, or that an
auto-increment id column was not about to become a media channel. The user confirmed by
typing "1".

This module is the check that was missing. It is deliberately boring and deterministic: it
looks at the actual values and answers, per column, whether the assigned role is possible.
The AI still *proposes* — it is genuinely good at reading "kosten_tv_excl_btw" and knowing
that is TV spend — but a proposal this module rejects never reaches a model. That is the
whole boundary in one sentence: the AI narrows the choice, the data decides.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np
import pandas as pd
from pandas.api import types as pdt

from mmm_core.ingestion.dates import _score as _date_parse_score

# A column whose values are almost all distinct, integer and increasing is an identifier
# (order number, row id). Fitting one as a channel is not merely useless — a monotone
# column correlates with any trend, so it will absorb real effect and look significant.
_ID_UNIQUENESS = 0.95
# A KPI that is constant explains nothing; below this many distinct values there is nothing
# for the model to explain at all.
_MIN_DISTINCT_KPI = 5


class ColumnRole(str, Enum):
    DATE = "date"
    KPI = "kpi"
    SPEND = "spend"
    CONTROL = "control"
    IGNORE = "ignore"


@dataclass(frozen=True)
class ColumnFinding:
    """One reason a column cannot play its assigned role, or should be looked at."""

    column: str
    code: str
    severity: str          # "blocking" | "warning"
    message: str           # Dutch, user-facing, says what to do
    suggested_role: ColumnRole | None = None


@dataclass(frozen=True)
class ColumnValidation:
    findings: tuple[ColumnFinding, ...] = ()

    @property
    def blocking(self) -> list[ColumnFinding]:
        return [f for f in self.findings if f.severity == "blocking"]

    @property
    def warnings(self) -> list[ColumnFinding]:
        return [f for f in self.findings if f.severity == "warning"]

    @property
    def ok(self) -> bool:
        return not self.blocking

    def for_column(self, name: str) -> list[ColumnFinding]:
        return [f for f in self.findings if f.column == name]


def looks_like_identifier(series: pd.Series) -> bool:
    """True for an order number, row id or similar counter.

    Two properties together, because either alone has false positives: nearly every value
    distinct (a price column rarely is) *and* whole numbers that only go up (a revenue
    column with a trend still goes down sometimes).
    """
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if len(clean) < 5:
        return False
    if clean.nunique() / len(clean) < _ID_UNIQUENESS:
        return False
    values = clean.to_numpy(dtype=float)
    if not np.all(values == np.round(values)):
        return False
    return bool(np.all(np.diff(values) > 0))


def _numeric_share(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    return float(pd.to_numeric(non_null, errors="coerce").notna().mean())


def validate_columns(
    data: pd.DataFrame, roles: dict[str, str | ColumnRole]
) -> ColumnValidation:
    """Check every assigned role against the column's actual values.

    Args:
        data: the uploaded table (raw, before any aggregation).
        roles: ``{column: role}`` as proposed — by the AI, by the user, or by both.

    Returns findings, not an exception: the caller shows all the problems at once rather
    than making the user discover them one upload at a time.
    """
    findings: list[ColumnFinding] = []

    for column, raw_role in roles.items():
        if column not in data.columns:
            findings.append(
                ColumnFinding(
                    column, "column_missing", "blocking",
                    f"Kolom {column!r} staat niet in het bestand.",
                )
            )
            continue
        role = ColumnRole(raw_role)
        series = data[column]
        if role is ColumnRole.IGNORE:
            continue

        if role is ColumnRole.DATE:
            if _date_parse_score(series) < 0.8:
                findings.append(
                    ColumnFinding(
                        column, "date_does_not_parse", "blocking",
                        f"Kolom {column!r} is aangemerkt als datum, maar de waarden zijn "
                        f"geen leesbare datums. Kies de kolom met de week- of dagdatum, of "
                        f"schrijf de datums als 2024-01-31.",
                    )
                )
            continue

        # Everything else has to be a number the model can actually use.
        share = _numeric_share(series)
        if share < 0.8:
            findings.append(
                ColumnFinding(
                    column, "not_numeric", "blocking",
                    f"Kolom {column!r} is aangemerkt als {role.value}, maar bevat "
                    f"grotendeels geen getallen ({share:.0%} leesbaar). Controleer de rol, "
                    f"of verwijder tekst uit de kolom.",
                    suggested_role=ColumnRole.IGNORE,
                )
            )
            continue

        values = pd.to_numeric(series, errors="coerce")
        clean = values.dropna()

        if looks_like_identifier(series):
            findings.append(
                ColumnFinding(
                    column, "looks_like_identifier", "blocking",
                    f"Kolom {column!r} lijkt een volgnummer of id (alleen oplopende, unieke "
                    f"gehele getallen). Zo'n kolom loopt gelijk op met de tijd en zou een "
                    f"effect toegewezen krijgen dat er niet is. Laat 'm buiten het model.",
                    suggested_role=ColumnRole.IGNORE,
                )
            )
            continue

        if role is ColumnRole.SPEND:
            n_negative = int((clean < 0).sum())
            if n_negative:
                findings.append(
                    ColumnFinding(
                        column, "negative_spend", "blocking",
                        f"Kolom {column!r} heeft {n_negative} week/weken met een negatieve "
                        f"waarde. Mediadruk kan niet negatief zijn en de na-ijlberekening "
                        f"is er niet op gedefinieerd. Zet correcties/refunds op 0 of "
                        f"verreken ze vooraf.",
                    )
                )
            elif clean.empty or float(clean.max()) <= 0:
                findings.append(
                    ColumnFinding(
                        column, "all_zero_channel", "blocking",
                        f"Kolom {column!r} staat de hele periode op 0. Een kanaal zonder "
                        f"uitgaven levert geen informatie op — haal 'm uit het model.",
                        suggested_role=ColumnRole.IGNORE,
                    )
                )
            elif set(clean.unique()) <= {0.0, 1.0}:
                # A 0/1 column is a campaign calendar, not media pressure. Modelled as a
                # channel it gets a saturation curve over the range [0, 1], a "total spend"
                # that is really a week count, and a ROAS divided by that count — the
                # numbers come out enormous and mean nothing.
                findings.append(
                    ColumnFinding(
                        column, "binary_column_as_spend", "blocking",
                        f"Kolom {column!r} bevat alleen 0 en 1. Dat is een campagnevlag, "
                        f"geen mediadruk: er valt geen verzadigingscurve of rendement per "
                        f"euro op te berekenen. Neem 'm mee als controlevariabele, dan "
                        f"corrigeert het model wél voor de weken dat de campagne liep.",
                        suggested_role=ColumnRole.CONTROL,
                    )
                )

        if role is ColumnRole.KPI:
            if clean.nunique() < _MIN_DISTINCT_KPI:
                findings.append(
                    ColumnFinding(
                        column, "kpi_barely_varies", "blocking",
                        f"Kolom {column!r} is aangemerkt als KPI maar heeft nauwelijks "
                        f"verschillende waarden. Er valt dan niets te verklaren.",
                    )
                )
            elif float(clean.max()) <= 0:
                findings.append(
                    ColumnFinding(
                        column, "kpi_not_positive", "blocking",
                        f"Kolom {column!r} heeft geen enkele positieve waarde. Een KPI moet "
                        f"minstens soms boven nul liggen.",
                    )
                )
            n_negative = int((clean < 0).sum())
            if n_negative:
                findings.append(
                    ColumnFinding(
                        column, "kpi_has_negatives", "warning",
                        f"Kolom {column!r} heeft {n_negative} negatieve week/weken. Dat kan "
                        f"kloppen (retouren), maar controleer of het geen fout is.",
                    )
                )

        if role is ColumnRole.CONTROL and clean.nunique() <= 1:
            findings.append(
                ColumnFinding(
                    column, "constant_control", "blocking",
                    f"Kolom {column!r} is constant over de hele periode en kan dus niets "
                    f"verklaren. Laat 'm weg.",
                    suggested_role=ColumnRole.IGNORE,
                )
            )

    findings.extend(_structural_findings(data, roles))
    return ColumnValidation(tuple(findings))


def _structural_findings(
    data: pd.DataFrame, roles: dict[str, str | ColumnRole]
) -> list[ColumnFinding]:
    """Problems with the assignment as a whole rather than with any single column."""
    findings: list[ColumnFinding] = []
    by_role: dict[ColumnRole, list[str]] = {}
    for column, raw_role in roles.items():
        by_role.setdefault(ColumnRole(raw_role), []).append(column)

    dates = by_role.get(ColumnRole.DATE, [])
    if len(dates) == 0:
        findings.append(
            ColumnFinding(
                "", "no_date_column", "blocking",
                "Er is geen datumkolom aangewezen. Zonder datum is er geen tijdreeks om te "
                "modelleren.",
            )
        )
    elif len(dates) > 1:
        findings.append(
            ColumnFinding(
                "", "multiple_date_columns", "blocking",
                f"Er zijn meerdere datumkolommen aangewezen ({', '.join(dates)}). Kies er "
                f"één als de periode van de rij.",
            )
        )

    kpis = by_role.get(ColumnRole.KPI, [])
    if len(kpis) == 0:
        findings.append(
            ColumnFinding(
                "", "no_kpi_column", "blocking",
                "Er is geen KPI aangewezen. Kies de kolom met wat je wilt verklaren "
                "(omzet, orders, leads).",
            )
        )
    elif len(kpis) > 1:
        findings.append(
            ColumnFinding(
                "", "multiple_kpi_columns", "blocking",
                f"Er zijn meerdere KPI-kolommen aangewezen ({', '.join(kpis)}). Een model "
                f"verklaart één uitkomst tegelijk; kies er één.",
            )
        )

    if not by_role.get(ColumnRole.SPEND):
        findings.append(
            ColumnFinding(
                "", "no_channels", "blocking",
                "Er is geen enkel marketingkanaal aangewezen. Zonder kanalen valt er niets "
                "aan marketing toe te schrijven.",
            )
        )
    return findings
