"""Read an uploaded source file (bytes) into a DataFrame.

More careful than it looks, because every one of these guesses can corrupt a whole model
silently. A Dutch export written in Latin-1 turns into mojibake column names that no longer
match the recipe; a semicolon-separated file read with commas becomes one column; a
``1.234,56`` read as ``1.234`` scales a channel down by a thousand.

So: encoding is detected rather than assumed, the separator is sniffed, and the chosen
interpretation is returned alongside the frame so the caller can tell the user what was
assumed instead of hoping it was right.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

import pandas as pd

# Tried in order. UTF-8 first (correct and by far the most common), then the two encodings
# Dutch and other European exports actually use.
_ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")
_SEPARATORS = (",", ";", "\t", "|")


@dataclass(frozen=True)
class ReadResult:
    frame: pd.DataFrame
    encoding: str
    separator: str


def detect_encoding(data: bytes) -> str:
    """First encoding that decodes the whole file. ``latin-1`` always succeeds, so this
    terminates; it is last precisely because it never fails and would mask the others."""
    for encoding in _ENCODINGS:
        try:
            data.decode(encoding)
            return encoding
        except UnicodeDecodeError:
            continue
    return "latin-1"


def detect_separator(text: str) -> str:
    """Sniff the delimiter, falling back to whichever candidate yields the most columns.

    ``csv.Sniffer`` is good but throws on short or unusual files, and pandas' own inference
    is worse: it happily reads a semicolon file as a single column and every later step then
    reports "no date column found", which sends the user hunting in the wrong place.
    """
    sample = text[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters="".join(_SEPARATORS)).delimiter
    except csv.Error:
        first_line = sample.splitlines()[0] if sample.splitlines() else ""
        return max(_SEPARATORS, key=first_line.count)


def read_table(filename: str, data: bytes) -> pd.DataFrame:
    """Read an uploaded file into a DataFrame."""
    return read_table_detailed(filename, data).frame


def read_table_detailed(filename: str, data: bytes) -> ReadResult:
    """Read an uploaded file, reporting how it was interpreted."""
    if filename.lower().endswith((".xlsx", ".xls")):
        return ReadResult(pd.read_excel(io.BytesIO(data)), encoding="binary", separator="")

    encoding = detect_encoding(data)
    text = data.decode(encoding)
    separator = detect_separator(text)
    frame = pd.read_csv(io.StringIO(text), sep=separator)
    if frame.shape[1] == 1 and separator != ";":
        # One column almost always means the separator guess was wrong; try the runner-up
        # rather than handing downstream a frame with no date column.
        alt = pd.read_csv(io.StringIO(text), sep=";")
        if alt.shape[1] > 1:
            return ReadResult(alt, encoding=encoding, separator=";")
    return ReadResult(frame, encoding=encoding, separator=separator)
