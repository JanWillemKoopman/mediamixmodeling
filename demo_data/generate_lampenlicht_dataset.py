"""Genereer de lampenlicht.nl demo-dataset voor de MMM Wizard.

Synthetische maar realistische wekelijkse data (2023-01-02 t/m 2026-12-28,
209 ISO-weken) voor een online verlichtingsretailer. Hoofdvraag van de
klant: **wat leveren offline en online advertenties op voor de totale
verkoop?** De KPI (totale_omzet, €) is opgebouwd uit een bekende ground
truth zodat het model de offline/online-bijdragen echt kan terugvinden.

Realistische kenmerken:
- sterk omgekeerd zomerseizoen: verlichting verkoopt in de donkere maanden
  (sept-feb piek, juni-juli dal), versterkt door de control `zonuren`
- offline: tv (flights in najaar + Black Friday, delayed na-ijl), radio,
  huis-aan-huis-folder (oplage, niet-monetair)
- online: google shopping (grootste kanaal), search brand/non-brand,
  meta, affiliate, e-mail (verzendingen)
- Black Friday / Sinterklaas / kerst-pieken; wintertijd-omslag zit in zonuren
- 2 ontbrekende waarden in `zonuren` (fill-strategie)
- 1 positieve uitschieter: virale social-post in week 2025-10-06

Draai met: python3 demo_data/generate_lampenlicht_dataset.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

rng = np.random.default_rng(510)

weeks = pd.date_range("2023-01-02", "2026-12-28", freq="W-MON")
n = len(weeks)
t = np.arange(n)
woy = weeks.isocalendar().week.to_numpy().astype(float)


def geometric_adstock(x, alpha):
    out = np.zeros_like(x, dtype=float)
    carry = 0.0
    for i, v in enumerate(x):
        carry = v + alpha * carry
        out[i] = carry
    return out


def delayed_adstock(x, alpha, theta, l_max=16):
    lags = np.arange(l_max)
    w = alpha ** ((lags - theta) ** 2)
    return np.convolve(x, w / w.sum())[:len(x)]


def hill(x, half_sat, slope=1.6):
    return x**slope / (x**slope + half_sat**slope)


# ---------------------------------------------------------------- kalender
black_friday = np.isin(weeks, pd.to_datetime(
    ["2023-11-20", "2024-11-25", "2025-11-24", "2026-11-23"])).astype(float)
sint_kerst = np.isin(woy, [48, 49, 50, 51]).astype(float)
najaar = np.isin(woy, np.arange(38, 52)).astype(float)  # donkere-maanden campagneseizoen
zomerdip = np.isin(woy, np.arange(23, 33)).astype(float)

# ---------------------------------------------------------------- offline spends
tv_flights = np.zeros(n)
for jr in (2023, 2024, 2025, 2026):
    m = (weeks >= f"{jr}-09-15") & (weeks <= f"{jr}-12-15")
    tv_flights = np.maximum(tv_flights, m.astype(float))
tv_spend = np.round(tv_flights * 65_000 * (0.7 + 0.6 * rng.random(n))
                    * (1 + 0.6 * black_friday), 0)

radio_on = np.maximum((rng.random(n) < 0.30).astype(float), najaar)
radio_spend = np.round(radio_on * 14_000 * (0.7 + 0.6 * rng.random(n)), 0)

folder_oplage = np.round(najaar * 450_000 * (0.8 + 0.4 * rng.random(n))
                         + black_friday * 250_000, -3)  # huis-aan-huis folders

# ---------------------------------------------------------------- online spends
seiz = 1 + 0.45 * najaar - 0.35 * zomerdip
shopping_spend = np.round((52_000 + 18_000 * black_friday) * seiz + rng.normal(0, 4_000, n), 0)
search_nonbrand_spend = np.round((30_000 + 8_000 * black_friday) * seiz + rng.normal(0, 2_500, n), 0)
search_brand_spend = np.round((9_000 + 4_000 * black_friday) * seiz + rng.normal(0, 900, n), 0)
meta_spend = np.round((16_000 + 7_000 * black_friday) * seiz + rng.normal(0, 2_000, n), 0)
affiliate_spend = np.round(7_000 + 3_500 * black_friday + 2_000 * najaar + rng.normal(0, 800, n), 0)
email_verzendingen = np.round(220_000 + 120_000 * black_friday + 60_000 * najaar
                              + rng.normal(0, 18_000, n), -2)

for a in (tv_spend, radio_spend, folder_oplage, shopping_spend, search_nonbrand_spend,
          search_brand_spend, meta_spend, affiliate_spend, email_verzendingen):
    np.clip(a, 0, None, out=a)

# ---------------------------------------------------------------- controls
# zonuren: veel zon in de zomer, weinig in de winter — drukt de lampverkoop
zonuren = np.round(np.clip(38 + 24 * np.cos(2 * np.pi * (woy - 26) / 52)
                           + rng.normal(0, 4, n), 4, None), 1)
korting_pct = np.round(np.clip(5 + 17 * black_friday + 7 * sint_kerst + 5 * zomerdip
                               + rng.normal(0, 1.5, n), 0, 30), 1)
vertrouwen = np.round(-35 + 14 * t / n + 3 * np.sin(2 * np.pi * (woy - 15) / 52)
                      + rng.normal(0, 1.1, n), 1)

# ---------------------------------------------------------------- ground truth KPI (€)
baseline = 420_000 + 350 * t
seizoen = 90_000 * np.cos(2 * np.pi * (woy - 49) / 52) + 30_000 * np.cos(4 * np.pi * (woy - 47) / 52)

offline_contrib = (
    95_000 * hill(delayed_adstock(tv_spend, 0.72, theta=2), 60_000)      # tv
    + 26_000 * hill(delayed_adstock(radio_spend, 0.65, theta=1), 15_000)  # radio
    + 30_000 * hill(geometric_adstock(folder_oplage, 0.3), 420_000)       # folder
)
online_contrib = (
    150_000 * hill(geometric_adstock(shopping_spend, 0.2), 58_000)        # shopping
    + 95_000 * hill(geometric_adstock(search_nonbrand_spend, 0.2), 34_000)
    + 45_000 * hill(geometric_adstock(search_brand_spend, 0.1), 9_500)
    + 42_000 * hill(geometric_adstock(meta_spend, 0.35), 19_000)
    + 24_000 * hill(geometric_adstock(affiliate_spend, 0.15), 8_000)
    + 28_000 * hill(geometric_adstock(email_verzendingen, 0.2), 260_000)
)

control_effect = (-2_600 * (zonuren - zonuren.mean())
                  + 2_800 * korting_pct
                  + 900 * (vertrouwen - vertrouwen.mean()))
events = 210_000 * black_friday + 70_000 * sint_kerst

kpi = baseline + seizoen + offline_contrib + online_contrib + control_effect + events \
    + rng.normal(0, 14_000, n)

# virale social-post: positieve uitschieter (leerpunt: event-dummy / student_t)
kpi[np.where(weeks == pd.Timestamp("2025-10-06"))[0][0]] *= 1.35

df = pd.DataFrame({
    "week": weeks.strftime("%Y-%m-%d"),
    "totale_omzet": np.round(kpi).astype(int),
    "tv_spend": tv_spend,
    "radio_spend": radio_spend,
    "folder_oplage": folder_oplage,
    "google_shopping_spend": shopping_spend,
    "search_nonbrand_spend": search_nonbrand_spend,
    "search_brand_spend": search_brand_spend,
    "meta_spend": meta_spend,
    "affiliate_spend": affiliate_spend,
    "email_verzendingen": email_verzendingen,
    "zonuren": zonuren,
    "promo_korting_pct": korting_pct,
    "consumenten_vertrouwen": vertrouwen,
})

# 2 ontbrekende waarden in zonuren (leerpunt: fill-strategie voor een control)
df.loc[[55, 148], "zonuren"] = np.nan

out = Path(__file__).parent / "lampenlicht_demo_dataset.csv"
df.to_csv(out, index=False)
print(f"{out}: {len(df)} rijen, {df.shape[1]} kolommen")
print(f"Omzet: min {df.totale_omzet.min():,} / gem {df.totale_omzet.mean():,.0f} / max {df.totale_omzet.max():,}")
print(f"Corr zonuren-omzet: {df.zonuren.corr(df.totale_omzet):.2f}")
