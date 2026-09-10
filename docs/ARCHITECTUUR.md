# Architectuur — MMM Wizard (v2)

De actuele beschrijving van het systeem zoals het na de refactor werkt. Het *waarom* achter
elke keuze staat in [`MMM_REFACTOR_PLAN.md`](./MMM_REFACTOR_PLAN.md); dit document beschrijft
de *stand*. Documenten in [`archief/`](./archief/) beschrijven v1 en zijn niet meer waar.

## 1. Onderdelen

```
Next.js (Vercel)  ──►  Supabase (Postgres + Storage + Realtime + RLS)  ◄──  Modal (Python worker)
      │                                                                          │
      └──────────────────────  Claude API (uitleg + intentie)  ──────────────────┘
```

| Map | Wat het is |
|---|---|
| `app/`, `components/`, `lib/` | De Next.js-bouwersapp (het achtstappentraject in `lib/flow/`) en het klantdashboard |
| `packages/mmm-core/` | De statistische kern: ingestie, model, fit, diagnostiek, validatie, optimalisatie. Kent Supabase niet en heeft geen netwerk nodig. |
| `worker/` | De Modal-worker: state machine, claiming, storage, foutclassificatie. Bevat geen statistiek — die leent hij van `mmm-core`. |
| `supabase/migrations/` | Het schema. `0022_mmm_v2_schema.sql` is de huidige basis. |

De scheiding is bewust: alles wat een *statistische* beslissing is, hoort in `mmm-core` en is
daar getest zonder database, worker of LLM. Alles wat een *levenscyclus*-beslissing is, hoort
in de worker en is daar getest zonder sampler.

## 2. De weg van CSV naar advies

```
upload  →  kolomvalidatie  →  dataset_versions  →  goedkeuring  →  model_configurations
                                                                          │
                                                        (worker claimt) ──┤
                                                                          ▼
   intentie → priors → prior-predictive gate → fit → diagnostiek → oordeel → model_results
```

1. **Upload en kolomherkenning.** Encoding en scheidingsteken worden gedetecteerd, niet geraden.
   `mmm_core.ingestion.columns.validate_columns()` weigert deterministisch een kolom die geen
   kanaal kán zijn (alles nul, te weinig actieve weken, constant, negatief) en herkent
   identifier-achtige kolommen (bijna-uniek, geheel, strikt oplopend) zodat een ordernummer nooit
   als KPI eindigt. De AI mag hier voorstellen doen; de weigering is code.
2. **Dataset samenstellen.** Een *recept* (`DatasetRecipe`) beschrijft welke bronbestanden,
   kolommen en rollen samen één tabel vormen. Het recept noemt bestanden bij hun **rij-id**,
   nooit bij een storage-pad: de server leidt het pad af uit de rijen van dit project, dus een
   recept kan niet bij een bestand van een ander project.
3. **Goedkeuring.** Alleen een dataset met `approved_at` mag gemodelleerd worden. Een oordeel
   `not_usable` blokkeert.
4. **Intentie, geen getallen.** De gebruiker (en de AI) kiezen uit een **gesloten woordenschat**
   (`mmm_core.model.intent`): draagt een kanaal lang na (`carryover`), hoe sterk werkt het
   (`strength`), zit het al tegen verzadiging aan (`saturation_belief`), hoe groot is het
   mediadeel (`media_share`). Allemaal enums. De AI kan het verkeerde *woord* kiezen, nooit een
   verkeerd *getal*.
5. **Priors afleiden.** `mmm_core.model.priors.build_model_config()` vertaalt intentie + gemeten
   datastatistieken deterministisch naar een `ModelConfig`. Elke prior krijgt een
   `PriorProvenance`: welke intentie, welke meting, welke regel.
6. **Prior-predictive gate.** Vóór de echte fit trekt de worker uit de priors alleen en toetst of
   die de waargenomen KPI überhaupt toelaten en niet absurd breed zijn. Zakt dit, dan is er geen
   fit — een model dat zijn eigen data a priori uitsluit is niet "nog niet gesampled", die is fout.
7. **Fit.** PyMC + numpyro NUTS. Adstock met burn-in (opwarmweken zitten in de convolutie maar
   niet in de likelihood), Hill-verzadiging met LogNormal halfverzadigingspunt, seizoen en trend
   gemeten in plaats van aangenomen.
8. **Diagnostiek en identificeerbaarheid.** R-hat, ESS, divergenties, E-BFMI, treedepth, plus
   holdout-MAPE, placebo-kanaal, intervaldekking en residuele autocorrelatie. Daarnaast
   `mmm_core.model.identify`: overlap tussen prior en posterior, relatieve intervalbreedte en de
   correlatie tussen kanaalbijdragen — dat laatste is hoe je ziet dat twee kanalen statistisch
   niet uit elkaar te trekken zijn.
9. **Oordeel.** `mmm_core.model.validate` kent vier niveaus en een expliciete ruleset-versie:

   | Niveau | Betekenis | Wat mag |
   |---|---|---|
   | `not_usable` | Sampling of aannames gefaald | niets |
   | `technically_completed` | Berekend, maar niet betrouwbaar | alleen diagnostiek |
   | `statistically_valid` | Convergentie, fit en dekking in orde | bijdragen tonen, publiceren |
   | `usable_for_decisions` | Bovendien identificeerbaar en gevalideerd | ROAS, budgetadvies |

   Het oordeel levert `allowed_outputs`; de frontend rendert een blok pas als
   `allows(validation, …)` dat toestaat. Er is geen pad waarlangs budgetadvies verschijnt voor
   een model dat zijn eigen drempel niet haalt.

## 3. De worker als state machine

`queued → validating → preparing_data → building_model → validating_model → sampling →
calculating_results → completed | failed | cancelled`

- **Claimen gebeurt precies één keer**, in de runner, via een compare-and-set-RPC
  (`claim_model_run`). Verliest hij, dan stopt hij met `{"status": "skipped"}`. De poller claimt
  níét — twee claims zouden elke run laten stranden.
- **Idempotency key** per run: dezelfde configuratie + dataset tweemaal insturen levert dezelfde
  rij, geen tweede fit.
- **Lease + heartbeat**: een run waarvan de worker omvalt, valt terug in de wachtrij in plaats van
  eeuwig "bezig" te blijven. Het traject toont de huidige stap in mensentaal en escaleert zichtbaar
  als het te lang duurt.
- **Fouten hebben een code, een gebruikersboodschap en een technische tekst.** De gebruiker ziet
  nooit een traceback; de bouwer verliest hem nooit.
- **Reproduceerbaarheid**: seed, pakketversies en de hash van de opgeloste specificatie staan bij
  de run.

## 4. Het traject dat de gebruiker doorloopt

`app/projects/[id]` is een vaste reeks van **acht stappen** (`lib/flow/`), niet een gesprek dat
toevallig vooruit gaat. Het waarom staat in
[`CHAT_PIPELINE_HERZIENING.md`](./CHAT_PIPELINE_HERZIENING.md); dit is de stand.

| Onderdeel | Wat het is |
|---|---|
| `lib/flow/steps.ts` | De acht stappen. Elke stap declareert zijn eigen acties, en de knoppen én de AI-briefing worden daaruit gerenderd. Een knop die niet bestaat, kan daardoor nergens opduiken. |
| `lib/flow/state.ts` | De toestand: per stap afgerond / achterhaald / aan de beurt / geblokkeerd / wachtend. Afgeleid uit de feiten plus het grootboek — nooit uit een positie in een lijst. |
| `mmm.project_steps` | Het grootboek: wat de gebruiker heeft besloten en wanneer. Zonder `status`-kolom en zonder `stale`-vlag; beide worden afgeleid, want een tweede waarheid loopt uit de pas. |
| `mmm.chat_messages` | Het transcript, stap-verankerd. Server-side gerenderd, dus een refresh verliest niets. |
| `app/api/flow` | De enige plek waar het traject vooruit gaat. Toetst elke actie tegen de acties die de huidige toestand daadwerkelijk aanbiedt. |

Zes invarianten gelden over **alle** toestanden die de flow kan aannemen, getoetst in
`lib/flow/__tests__`: nooit een doodlopende toestand; de getoonde stap volgt uit de feiten; geen
getal zonder zijn oordeel; elke fout heeft mensentaal én een uitweg; onomkeerbaar betekent
bevestigd (met uitleg waarvoor); elke stap is af te ronden zonder te typen.

## 5. Waar de AI wél en niet mag komen

De AI **mag**: uitleggen, vragen beantwoorden, een kolomrol voorstellen, een *verwachting per
kanaal* voorstellen, de data grondig nakijken, en een uitkomst in gewone taal samenvatten.

De AI **mag niet**: modelcode genereren die wordt uitgevoerd, priors als getal zetten, een model
goed verklaren, onzekerheid verbergen, of een getal noemen dat niet uit de berekening komt.

Hoe dat wordt afgedwongen, niet alleen afgesproken:

- Het enige gereedschap dat de gids heeft is `propose_beliefs`, en het schema daarvan wordt
  **gegenereerd uit dezelfde vraaglijsten die de kaart rendert** (`lib/flow/beliefs.ts`). Er is
  geen numeriek veld om in te vullen, en geen waarde die de kaart niet kent.
- Elk voorstel is een *voorstel*: het vult de kaart zichtbaar in; de gebruiker past aan en
  bevestigt zelf. `/api/flow/ask` schrijft niets naar het grootboek en start niets.
- De briefing die de gids krijgt wordt gegenereerd uit de flow — welke stap, welke knoppen,
  welke feiten. Dat sluit prompt-drift uit: de vorige prompt beschreef knoppen en velden die
  niet meer bestonden en sprak zichzelf tegen.
- **Elk getal in de uitkomst komt uit code** (`lib/flow/outcome.ts`). De gids schrijft de
  duiding eromheen, en `lib/ai/numberCheck.ts` toetst achteraf of elk getal in die tekst
  herleidbaar is tot de `FitSummary`; zo niet, dan wordt de tekst niet bewaard.
- De worker leest de intentie opnieuw en leidt de priors zelf af; hij vertrouwt niets wat de
  client meestuurt. `_PRIOR_BOUNDS` in `jobspec.py` is de laatste verdedigingslinie.
- Een ROAS-kalibratie op basis van een experiment vereist een `confirmed_by` — een mens.
- De klantsamenvatting wordt geweigerd zolang het oordeel onder `statistically_valid` ligt.

## 6. Testen

```bash
npm run lint && npm run typecheck && npm test && npm run build   # frontend
pytest packages/mmm-core                             # snelle kern (geen sampler)
pytest packages/mmm-core -m slow                     # echte NUTS-fit: herstelmatrix
pytest worker/tests                                  # levenscyclus zonder database
```

De frontend-suite (vitest) toetst de zes invarianten van het traject over alle bereikbare
toestanden, loopt de hele weg af op de meegeleverde demo-CSV, legt de begeleidende teksten vast
in een snapshot, en controleert dat elke aangeroepen API-route ook echt bestaat — dat laatste
vond een aanroep die jarenlang faalde zonder dat iets klaagde.

De trage Python-suite is een **herstelmatrix**: synthetische data met bekende waarheid (basis,
onverzadigd, seizoensverwarring, collineair, telling-KPI, GRP-uitsluiting) gaat door de
*productieweg* — `measure_dataset` → `build_model_config` → fit — en de test controleert of het
model de waarheid terugvindt én of het bij collineaire kanalen zélf zegt dat het ze niet kan
scheiden. Dat laatste is het punt: een model dat niet weet wat het niet weet, is de fout die dit
product moet uitsluiten.
