"""Genereer de MediaMarkt NL demo-dataset voor de MMM Wizard.

Synthetische maar realistische wekelijkse data (2023-01-02 t/m 2026-12-28,
209 ISO-weken) voor het trainen van data-analisten met de app. De KPI
(flatscreen_verkopen) is opgebouwd uit een bekende ground truth:
baseline + trend + seizoen + adstocked/gesatureerde kanaal-effecten +
controls + ruis. Daardoor kan het Bayesiaanse model de effecten ook echt
terugvinden, en weet de trainer wat "het goede antwoord" is.

Bewust ingebouwde leerpunten (zie demo_data/DEMO_DATASET_MEDIAMARKT.md):
- expliciet tv-campagneplan: always-on-periodes (0/1-kolom) vs. burst-
  campagnes (0/1-kolom) rond Black Friday/kerst, EK 2024 en WK 2026
- tv/radio met delayed na-ijl; digitale kanalen geometric
- meta en youtube sterk gecorreleerd (multicollineariteit-waarschuwing)
- tiktok start pas in week 70 (kanaal-launch midden in de reeks)
- email als niet-monetair "spend"-kanaal (verzendingen)
- Black Friday / kerst-pieken en de EK-voetbal-zomer 2024
- 3 ontbrekende waarden in consumenten_vertrouwen (fill-strategie)
- 1 dubbele datumrij (kwaliteitsrapport)
- 1 negatieve uitschieter door een webshopstoring (event-dummy / student_t)

Draai met: python3 demo_data/generate_demo_dataset.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

rng = np.random.default_rng(2026)

weeks = pd.date_range("2023-01-02", "2026-12-28", freq="W-MON")
n = len(weeks)
t = np.arange(n)
woy = weeks.isocalendar().week.to_numpy().astype(float)


def geometric_adstock(x: np.ndarray, alpha: float) -> np.ndarray:
    out = np.zeros_like(x, dtype=float)
    carry = 0.0
    for i, v in enumerate(x):
        carry = v + alpha * carry
        out[i] = carry
    return out


def delayed_adstock(x: np.ndarray, alpha: float, theta: int, l_max: int = 16) -> np.ndarray:
    lags = np.arange(l_max)
    w = alpha ** ((lags - theta) ** 2)
    w = w / w.sum()
    return np.convolve(x, w)[:len(x)]


def hill(x: np.ndarray, half_sat: float, slope: float = 1.6) -> np.ndarray:
    return x**slope / (x**slope + half_sat**slope)


# ---------------------------------------------------------------- kalender
def week_flag(*dates: str) -> np.ndarray:
    ds = pd.to_datetime(list(dates))
    return np.isin(weeks, ds).astype(float)


black_friday = week_flag("2023-11-20", "2024-11-25", "2025-11-24", "2026-11-23")
sinterklaas_kerst = np.isin(woy, [49, 50, 51]).astype(float)
# EK voetbal 2024 en WK voetbal 2026: aankooppiek vooral in de weken vóór de aftrap
ek_koopweken = ((weeks >= "2024-05-20") & (weeks <= "2024-06-17")).astype(float)
wk_koopweken = ((weeks >= "2026-05-18") & (weeks <= "2026-06-15")).astype(float)
voetbal_koopweken = np.maximum(ek_koopweken, wk_koopweken)

# ---------------------------------------------------------------- spends
def flights(base: float, prob: float, boost_mask: np.ndarray, boost: float) -> np.ndarray:
    on = (rng.random(n) < prob).astype(float)
    on = np.maximum(on, boost_mask)
    lvl = base * (0.7 + 0.6 * rng.random(n)) * (1 + boost * boost_mask)
    return np.round(on * lvl, 0)


q4 = np.isin(woy, np.arange(44, 53)).astype(float)


def period_mask(*ranges: tuple[str, str]) -> np.ndarray:
    m = np.zeros(n)
    for start, end in ranges:
        m = np.maximum(m, ((weeks >= start) & (weeks <= end)).astype(float))
    return m


# --- TV-campagneplan (expliciet, komt als 0/1-kolommen in de dataset) ---
# Always-on: doorlopende basisdruk op tv voor flatscreens, bescheiden weekbudget.
tv_always_on = period_mask(
    ("2023-01-02", "2023-06-26"),   # H1 2023
    ("2024-09-02", "2025-03-31"),   # najaar 2024 t/m Q1 2025
    ("2026-01-05", "2026-05-25"),   # aanloop naar het WK 2026
)
# Burst-campagnes: korte, zware flights rond commerciële piekmomenten.
tv_burst = period_mask(
    ("2023-11-06", "2023-12-18"),   # Black Friday + kerst 2023
    ("2024-05-13", "2024-06-17"),   # EK voetbal 2024
    ("2024-11-11", "2024-12-16"),   # Black Friday + kerst 2024
    ("2025-03-03", "2025-03-31"),   # voorjaarscampagne 2025
    ("2025-11-10", "2025-12-15"),   # Black Friday + kerst 2025
    ("2026-05-11", "2026-06-15"),   # WK voetbal 2026
    ("2026-11-09", "2026-12-14"),   # Black Friday + kerst 2026
)

tv_spend = np.round(
    tv_always_on * 36_000 * (0.85 + 0.3 * rng.random(n))
    + tv_burst * 150_000 * (0.75 + 0.5 * rng.random(n)),
    0,
)
radio_spend = flights(22_000, 0.35, q4, 0.5)

search_generic = 38_000 + 6_000 * np.sin(2 * np.pi * woy / 52) + 14_000 * q4 \
    + 10_000 * black_friday + rng.normal(0, 3_000, n)
search_brand = 12_000 + 4_500 * q4 + 5_000 * black_friday + 3_000 * voetbal_koopweken \
    + rng.normal(0, 1_200, n)

meta_base = 20_000 + 7_000 * q4 + 6_000 * black_friday + rng.normal(0, 2_500, n)
meta_spend = meta_base
youtube_spend = 0.62 * meta_base + rng.normal(0, 1_200, n)  # bewust ~0.9 gecorreleerd

tiktok_spend = np.where(t >= 70, 9_000 + 4_000 * q4[np.arange(n)] + rng.normal(0, 1_500, n), 0.0)

email_verzendingen = np.round(180_000 + 90_000 * q4 + 120_000 * black_friday
                              + rng.normal(0, 15_000, n), -2)

for arr in (tv_spend, radio_spend, search_generic, search_brand, meta_spend,
            youtube_spend, tiktok_spend, email_verzendingen):
    np.clip(arr, 0, None, out=arr)

# ---------------------------------------------------------------- controls
prijs = 699 - 0.35 * t - 60 * black_friday - 25 * sinterklaas_kerst + rng.normal(0, 8, n)
korting_pct = np.round(np.clip(4 + 18 * black_friday + 8 * sinterklaas_kerst
                               + 6 * voetbal_koopweken + rng.normal(0, 1.5, n), 0, 30), 1)
vertrouwen = np.round(-38 + 12 * t / n + 4 * np.sin(2 * np.pi * (woy - 20) / 52)
                      + rng.normal(0, 1.2, n), 1)

# ---------------------------------------------------------------- ground truth KPI
baseline = 7_500 + 9.0 * t  # intercept + lichte groeitrend
seizoen = 1_400 * np.cos(2 * np.pi * (woy - 51) / 52) + 700 * np.cos(4 * np.pi * (woy - 47) / 52)

contrib = (
    3_400 * hill(delayed_adstock(tv_spend, 0.75, theta=2), 95_000)
    + 900 * hill(delayed_adstock(radio_spend, 0.7, theta=1), 26_000)
    + 3_000 * hill(geometric_adstock(search_generic, 0.25), 42_000)
    + 1_700 * hill(geometric_adstock(search_brand, 0.15), 13_000)
    + 1_500 * hill(geometric_adstock(meta_spend, 0.4), 24_000)
    + 700 * hill(geometric_adstock(youtube_spend, 0.5), 16_000)
    + 500 * hill(geometric_adstock(tiktok_spend, 0.35), 11_000)
    + 800 * hill(geometric_adstock(email_verzendingen, 0.2), 220_000)
)

control_effect = -9.0 * (prijs - prijs.mean()) + 95 * korting_pct + 28 * (vertrouwen - vertrouwen.mean())
events = 5_200 * black_friday + 2_200 * sinterklaas_kerst + 2_800 * voetbal_koopweken

kpi = baseline + seizoen + contrib + control_effect + events + rng.normal(0, 320, n)

# webshopstoring: negatieve uitschieter (leerpunt: event-dummy of student_t)
storing_idx = np.where(weeks == pd.Timestamp("2024-03-04"))[0][0]
kpi[storing_idx] *= 0.55

df = pd.DataFrame({
    "week": weeks.strftime("%Y-%m-%d"),
    "flatscreen_verkopen": np.round(kpi).astype(int),
    "tv_spend": tv_spend,
    "tv_always_on_campagne": tv_always_on.astype(int),
    "tv_burst_campagne": tv_burst.astype(int),
    "radio_spend": radio_spend,
    "search_generic_spend": np.round(search_generic, 0),
    "search_brand_spend": np.round(search_brand, 0),
    "meta_spend": np.round(meta_spend, 0),
    "youtube_spend": np.round(youtube_spend, 0),
    "tiktok_spend": np.round(tiktok_spend, 0),
    "email_verzendingen": email_verzendingen,
    "gemiddelde_prijs": np.round(prijs, 2),
    "promo_korting_pct": korting_pct,
    "consumenten_vertrouwen": vertrouwen,
})

# 3 ontbrekende waarden in een control (leerpunt: fill-strategie)
df.loc[[30, 31, 104], "consumenten_vertrouwen"] = np.nan
# 1 dubbele datumrij (leerpunt: kwaliteitsrapport meldt duplicaten)
df = pd.concat([df, df.iloc[[60]]], ignore_index=True).sort_values("week", kind="stable")

out = Path(__file__).parent / "mediamarkt_demo_dataset.csv"
df.to_csv(out, index=False)
print(f"{out}: {len(df)} rijen, {df.shape[1]} kolommen, "
      f"{df['week'].iloc[0]} t/m {df['week'].iloc[-1]}")
print(f"Correlatie meta/youtube: {df['meta_spend'].corr(df['youtube_spend']):.2f}")
