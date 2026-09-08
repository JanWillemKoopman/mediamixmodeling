"""Reading uploaded files.

Every guess this module makes can corrupt a whole model silently, which is why it guesses
carefully and reports what it assumed. A Dutch export written in cp1252 turns into mojibake
column names that no longer match the recipe; a semicolon file read with commas becomes one
column and every later step reports "no date column found", sending the user hunting in
entirely the wrong place.
"""

from __future__ import annotations

import pandas as pd

from mmm_worker.tables import detect_encoding, detect_separator, read_table, read_table_detailed


def test_a_plain_utf8_comma_file_reads_as_itself():
    data = "week,revenue\n2024-01-01,100\n2024-01-08,120\n".encode()
    result = read_table_detailed("x.csv", data)
    assert list(result.frame.columns) == ["week", "revenue"]
    assert result.separator == ","


def test_a_semicolon_file_is_not_read_as_one_column():
    data = "week;revenue\n2024-01-01;100\n2024-01-08;120\n".encode()
    frame = read_table("x.csv", data)
    assert list(frame.columns) == ["week", "revenue"]


def test_a_tab_separated_file_is_recognised():
    data = b"week\trevenue\n2024-01-01\t100\n2024-01-08\t120\n"
    assert list(read_table("x.tsv", data).columns) == ["week", "revenue"]


def test_a_cp1252_export_keeps_its_column_names_intact():
    """A euro sign at byte 0x80 is undecodable as UTF-8; guessing wrong renames the column."""
    data = "week,prijs_€,omzet\n2024-01-01,10,1234\n".encode("cp1252")
    frame = read_table("x.csv", data)
    assert list(frame.columns) == ["week", "prijs_€", "omzet"]


def test_a_utf8_bom_is_stripped_from_the_first_column_name():
    data = "﻿week,revenue\n2024-01-01,100\n".encode("utf-8")
    assert list(read_table("x.csv", data).columns) == ["week", "revenue"]


def test_encoding_detection_prefers_utf8_over_the_never_failing_fallback():
    assert detect_encoding("week,omzet\n".encode()) in ("utf-8", "utf-8-sig")
    # latin-1 decodes any byte string, so it must be tried last or it would mask everything.
    assert detect_encoding(b"\x81\x82\x83") == "latin-1"


def test_separator_detection_falls_back_to_the_most_frequent_candidate():
    # Too short for csv.Sniffer to be confident, but obvious to a human.
    assert detect_separator("a;b\n1;2\n") == ";"


def test_an_excel_file_is_read_without_encoding_guesswork(tmp_path):
    path = tmp_path / "x.xlsx"
    pd.DataFrame({"week": ["2024-01-01"], "revenue": [100]}).to_excel(path, index=False)
    result = read_table_detailed("x.xlsx", path.read_bytes())
    assert list(result.frame.columns) == ["week", "revenue"]
    assert result.encoding == "binary"
