"""Synthetic, deterministic test data for the ingestion layer.

These generators double as the "known test datasets" the build plan asks for: their
expected ISO-week aggregates and analysis window are computable by hand, so the tests
below assert against ground truth rather than against whatever the code happens to do.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def daily_frame(
    start: str, periods: int, value: float | np.ndarray, *,
    date_col: str = "date", value_col: str = "value", freq: str = "D",
) -> pd.DataFrame:
    """A tidy source frame with one date column and one constant/array value column."""
    dates = pd.date_range(start, periods=periods, freq=freq)
    if np.isscalar(value):
        value = np.full(periods, value, dtype=float)
    return pd.DataFrame({date_col: dates, value_col: np.asarray(value, dtype=float)})


def three_source_scenario(seed: int = 0) -> dict[str, pd.DataFrame]:
    """A realistic multi-source scenario with a hand-known overlap window.

    - revenue (KPI):  daily, 2022-01-03 .. 2022-03-27
    - google (spend): daily, 2022-01-03 .. 2022-03-27
    - facebook (spend): daily, 2022-02-07 .. 2022-03-27   <- starts later
    - price (control, non-essential): daily, 2021-12-06 .. 2022-05-01 (spans wider)

    Essential sources = revenue, google, facebook -> overlapping window starts on the
    facebook start week (Monday 2022-02-07) and ends on the common last week.
    """
    rng = np.random.default_rng(seed)
    n_full = (pd.Timestamp("2022-03-27") - pd.Timestamp("2022-01-03")).days + 1  # 84 days

    revenue = daily_frame("2022-01-03", n_full, 1000 + rng.normal(0, 10, n_full),
                          date_col="week", value_col="revenue")
    google = daily_frame("2022-01-03", n_full, 50.0, date_col="date", value_col="google_spend")

    n_fb = (pd.Timestamp("2022-03-27") - pd.Timestamp("2022-02-07")).days + 1  # 49 days
    facebook = daily_frame("2022-02-07", n_fb, 30.0, date_col="datum",
                           value_col="facebook_spend")

    n_price = (pd.Timestamp("2022-05-01") - pd.Timestamp("2021-12-06")).days + 1
    price = daily_frame("2021-12-06", n_price, 9.99, date_col="day", value_col="price")

    return {"revenue": revenue, "google": google, "facebook": facebook, "price": price}
