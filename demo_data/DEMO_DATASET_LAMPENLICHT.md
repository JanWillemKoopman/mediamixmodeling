# Demo-dataset: lampenlicht.nl — offline vs. online advertenties op de totale verkoop

**Bestand:** `demo_data/lampenlicht_demo_dataset.csv` · **Generator:** `demo_data/generate_lampenlicht_dataset.py`
(deterministisch, seed 510 — opnieuw draaien geeft exact dezelfde data)

**Hoofdvraag van de klant:** *"Wat leveren onze offline en online advertenties op voor de
totale verkoop?"* De dataset is gebouwd om precies dat gesprek te voeren: de kanalen
splitsen netjes in een offline- en een online-blok, met een bekende ground truth per blok.

## Inhoud

- **Periode:** 2023-01-02 t/m 2026-12-28, 209 ISO-weken (maandag-datums)
- **KPI:** `totale_omzet` — totale weekomzet in € (±€427k–1,41M, gem. €724k)
- **Offline (3):** `tv_spend` (najaarflights sept–dec + Black Friday-boost, lange na-ijl),
  `radio_spend`, `folder_oplage` (huis-aan-huis folders, niet-monetair volume, alleen najaar)
- **Online (6):** `google_shopping_spend` (grootste kanaal), `search_nonbrand_spend`,
  `search_brand_spend`, `meta_spend`, `affiliate_spend`, `email_verzendingen`
- **3 controls:** `zonuren` (bevat 2 NaN's), `promo_korting_pct`, `consumenten_vertrouwen`

## Realistische kenmerken

- **Omgekeerd seizoen:** verlichting verkoopt in de donkere maanden — piek sept–feb, dal
  juni–juli. De control `zonuren` correleert −0,80 met de omzet: hét gesprek over
  *seizoen vs. media* (najaarscampagnes vallen samen met de donkere piek — zonder goede
  baseline/controls krijgt tv de eer van de winter).
- **Black Friday / Sinterklaas / kerst** geven extra pieken in omzet, spend en korting.
- **Virale social-post** in week **2025-10-06** (+35% omzet): event-dummy of `student_t`.
- **NaN's in `zonuren`** (weken 2024-01-22 en 2025-11-03): fill-strategie kiezen.

## Ground truth (wat het model hoort terug te vinden)

KPI = baseline (€420k + groeitrend) + winterseizoen + kanaalbijdragen + controls + events + ruis.

| Blok | Kanaal | Adstock (echt) | Max. bijdrage/week |
|---|---|---|---|
| Offline | tv | delayed, piek na ~2 wk | €95k |
| Offline | radio | delayed, piek na ~1 wk | €26k |
| Offline | folder | geometric α=0,3 | €30k |
| Online | google_shopping | geometric α=0,2 | €150k |
| Online | search_nonbrand | geometric α=0,2 | €95k |
| Online | search_brand | geometric α=0,1 | €45k |
| Online | meta | geometric α=0,35 | €42k |
| Online | affiliate | geometric α=0,15 | €24k |
| Online | email | geometric α=0,2 | €28k |

Controls: zonuren −€2.600 per uur boven gemiddeld; korting +€2.800 per procentpunt;
vertrouwen +€900 per indexpunt. Events: Black Friday +€210k, sint/kerst-weken +€70k.

**Het antwoord op de hoofdvraag** (bij benadering, uit de ground truth): online draagt
structureel het meest bij — vooral shopping en non-brand search — maar offline is niet
nul: tv levert in het najaar substantieel op, mét weken na-ijl na de flight. Search brand
heeft de hoogste ROAS maar vangt deels bestaande koopintentie (`intent`-kanaaltype!).
Let op: tv-flights vallen samen met het donkere seizoen — pas mét seizoen + `zonuren` in
het model wordt de tv-bijdrage eerlijk geschat.

## Suggesties voor de wizard-config

- Kanaaltypes: search_brand = `intent`; meta = `brand`; tv/radio = `delayed` adstock met
  hogere `l_max`; rest `geometric`.
- Controls alle drie meenemen; `zonuren` een fill-strategie geven (`interpolate` past goed).
- Event-dummy's: Black Friday (terugkerend) en de virale week 2025-10-06.
- Seizoen áán (cruciaal vanwege het winterseizoen).

## Zakelijke context om aan de architect te geven (rollenspel)

> "Lampenlicht.nl verkoopt verlichting online; ons seizoen is omgekeerd — we pieken zodra
> de dagen korter worden en zakken in de zomer. TV en radio draaien alleen in het najaar
> (flights), en we verspreiden dan ook huis-aan-huis-folders. Online zijn Google Shopping
> en search onze grootste kanalen. In oktober 2025 ging een social-post viraal met een
> uitzonderlijke omzetweek. De hoofdvraag: wat leveren offline en online advertenties
> ieder op voor de totale omzet?"
