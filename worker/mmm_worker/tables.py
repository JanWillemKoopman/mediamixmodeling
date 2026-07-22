"""Read an uploaded source file (bytes) into a DataFrame based on its extension."""

from __future__ import annotations

import io

import pandas as pd


def read_table(filename: str, data: bytes) -> pd.DataFrame:
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(data))
    # default to CSV (the common export format); pandas sniffs the separator poorly, so
    # be explicit about the common European case only if a plain read fails.
    try:
        return pd.read_csv(io.BytesIO(data))
    except Exception:
        return pd.read_csv(io.BytesIO(data), sep=";")
