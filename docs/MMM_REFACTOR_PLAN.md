# MMM Refactor Plan

**Status:** **uitgevoerd.** Fase 0 (de audit hieronder) is ongewijzigd bewaard als het
verslag van wat er mis was; fasen 1 t/m 10 uit §10 zijn daarna geïmplementeerd. Zie
[§0 Uitvoeringsstatus](#0-uitvoeringsstatus) direct hieronder voor wat er precies gebouwd is,
wat bewust anders is gelopen dan gepland en wat niet gebouwd is. De actuele beschrijving van
het systeem staat in [`ARCHITECTUUR.md`](./ARCHITECTUUR.md); dit document blijft het *waarom*.

Dit document was het resultaat van FASE 0 (volledige audit, geen codewijzigingen) en is het
centrale technische en productmatige plan voor de herstructurering.

**Scope van de audit:** de volledige applicatie achter de login — frontend (`app/`,
`components/`, `lib/`), API-routes, Supabase-schema + RLS, de statistische kern
(`packages/mmm-core`), de Modal-worker (`worker/`), de AI-laag (`lib/anthropic/`), CI en
dependency-beheer. Alle bevindingen hieronder zijn gebaseerd op gelezen code, niet op
aannames; waar een bevinding numeriek is, staat de meting erbij.

**Verificatie tijdens de audit:**

- `pytest packages/mmm-core worker/tests` → **291 passed, 3 skipped** (skips = de fit-tests
  zonder de `[model]`-extra). De bestaande testsuite is groen.
- `pytest packages/mmm-core -m slow` (met `pymc`/`numpyro`/`arviz`) → **16 passed** in 3 m 48 s.
  De end-to-end NUTS-fit tegen de ground-truth-simulator draait en slaagt.
- Numerieke reproductie van de prior-schaalproblemen en het NaN-probleem: zie §3.2 / §3.1.

**Belangrijk om te begrijpen bij die groene suite:** de bestaande tests bewijzen dat de
*code doet wat de code bedoelt*. Ze toetsen niet of de *statistische keuzes* kloppen. De
recovery-test draait met één parameterset; er is geen test die de priors op schaal
controleert, geen test die een niet-verzadigd kanaal terugvindt, en geen test met een
KPI-week op nul. Alle P0-bevindingen hieronder zitten precies in dat gat.

---

---

## 0. Uitvoeringsstatus

Deze sectie is ná de implementatie toegevoegd. Alles eronder (§1–§14) is het oorspronkelijke
auditrapport en is bewust niet herschreven: het beschrijft de toestand vóór de refactor.

### Wat er gebouwd is

| Fase (§10) | Status | Belangrijkste bestanden |
|---|---|---|
| 1 — P0-bugs | ✅ | `model/fit.py` (NaN→null, veilige MAPE, nullable ROAS), `ingestion/` (encoding/scheidingsteken), storage-pad-IDOR gedicht |
| 2 — Statistische kern | ✅ | `model/datastats.py`, `model/priors.py`, `model/build.py`, `model/config.py` |
| 3 — Intent i.p.v. getallen | ✅ | `model/intent.py`, `lib/modelIntent.ts`, `lib/anthropic/architect.ts` |
| 4 — Diagnostiek en identificeerbaarheid | ✅ | `model/identify.py`, uitgebreide `Diagnostics` in `model/fit.py` |
| 5 — Validatielaag (4 niveaus) | ✅ | `model/validate.py`, `allowed_outputs` + `allows()` in de frontend |
| 6 — Worker en state machine | ✅ | `worker/mmm_worker/runner.py`, `ports.py`, `jobspec.py` |
| 7 — Datamodel en migratie | ✅ | `supabase/migrations/0021_mmm_v2_schema.sql` |
| 8 — Data-ingestie | ✅ | `ingestion/columns.py` (`validate_columns`, `looks_like_identifier`) |
| 9 — AI-orkestratie | ✅ | `propose_model_intent` (alleen enums), `/api/fit-refine` geeft voorstellen terug i.p.v. jobs aan te maken |
| 10 — Opruimen en eindvalidatie | ✅ | eslint in CI, `pymc-marketing` verwijderd, documentatie samengevoegd in `docs/` |

### De kernfout die dit alles rechtvaardigde

De priorschaal groeide mee met het aantal kanalen: bij 1 kanaal impliceerden de priors een
verwachte media-bijdrage van 0,81× de mediane KPI, bij 8 kanalen 2,28× — het model geloofde
a priori dat media meer dan het dubbele van de omzet veroorzaakte. `priors.py` legt nu
expliciet vast dat `E[intercept] + Σ E[beta_c]·E[sat_c]` gelijk is aan de mediane KPI,
ongeacht het aantal kanalen. Dit is getest, niet aangenomen:
`test_prior_predictive_kpi_does_not_grow_with_the_number_of_channels` eist dat de spreiding
over 1–12 kanalen onder 0,05 blijft.

### Waar de uitvoering bewust afweek van het plan

- **Drempel voor `usable_for_decisions`.** Het plan liet dit open (§14). Gekozen is: bovenop
  de statistische eisen moet elk kanaal waarvoor advies wordt gegeven identificeerbaar zijn
  (geen contributiecorrelatie boven 0,7 met een ander kanaal) en moet er een geldige
  holdout-toets zijn. De drempel voor "niet te scheiden" is op 0,7 gezet in plaats van 0,8,
  omdat 0,8 in de herstelmatrix aantoonbaar collineaire kanalen nog steeds doorliet.
- **Halfverzadiging als LogNormal in plaats van Beta.** Een Beta op (0,1) kan "dit kanaal is
  nog lang niet verzadigd" niet uitdrukken — het halfverzadigingspunt kan dan per definitie
  niet boven de waargenomen maximale druk liggen. Dat is een aanname vermomd als prior.
- **Extra diagnostiek is standaard aan** (holdout, placebo-kanaal, intervaldekking, prior-
  sensitiviteit), conform de beslissing van de product owner, ondanks ~2,5× rekentijd.
- **Geen multi-tenant.** Bewust niet gebouwd; de app is in ontwikkeling. RLS scheidt
  bouwer/klant, meer niet.
- **De poller claimt niet.** In het plan stond claiming bij het oppakken. Dat bleek fout: de
  runner claimt zelf, en twee claims zouden elke run laten stranden. Eén claim, in de runner.

### Wat niet gebouwd is

- **Migratie van bestaande data.** Vervallen: de product owner heeft bevestigd dat alle
  aanwezige data testdata is. `0021` dropt de oude tabellen in plaats van ze te migreren.
- **Hiërarchisch model over meerdere klanten.** Verwijderd (`model/hierarchical.py`): het was
  niet in gebruik, niet gevalideerd, en zonder multi-tenant zonder doel.

### Verificatie na afloop

```
pytest packages/mmm-core worker/tests   → 401 passed
pytest packages/mmm-core -m slow        → herstelmatrix (echte NUTS-fit)
npm run lint / typecheck / build        → schoon (2 waarschuwingen, 0 fouten)
```

De herstelmatrix is de belangrijkste toevoeging aan de teststrategie: synthetische data met
bekende waarheid gaat door de *productieweg* (`measure_dataset` → `build_model_config` → fit)
in zes scenario's — basis, onverzadigd, seizoensverwarring, collineair, telling-KPI en een
GRP-kanaal dat uit het budgetadvies moet blijven. Bij het collineaire scenario is de eis niet
dat het model de waarheid vindt, maar dat het **zelf zegt dat het de kanalen niet kan
scheiden**. Een model dat niet weet wat het niet weet, is precies de fout die dit product
moet uitsluiten.

---

## 1. Executive summary

### 1.1 Wat is de huidige staat?

Dit is **geen prototype dat opnieuw begint**. Er staat een serieuze hoeveelheid goed werk,
met name in twee lagen:

- **`mmm_core.ingestion`** is de sterkste module van het hele project. Window-first
  imputatie (nooit nul-spend-weken verzinnen vóór een kanaal bestond), locale-bewuste
  currency-parsing, detectie van partiële randweken, grovere-dan-wekelijkse cadans, VIF over
  alle predictoren, lokale robuuste-z-outliers, bijna-identieke kanalen, over-parameterisatie.
  Dat is precies het niveau dat een MMM-applicatie nodig heeft, en het is getest.
- **`mmm_core.transforms`** (adstock + saturatie) is wiskundig correct: strikt causaal,
  genormaliseerde laggewichten, geometrisch én delayed, Hill én logistic, met een
  `saturation_half_point` die de families vergelijkbaar maakt. `model/predict.py` spiegelt
  `model/build.py` component-voor-component, met een gepinde in-sample-reproductie.

Daaromheen zit een **wizard die de juiste vorm heeft** (deterministische fase-machine,
chat-gestuurd maar niet LLM-gestuurd) en een **worker die de juiste architectuur heeft**
(ports + injecteerbare fit, dus testbaar zonder cloud).

Maar de **kern van de statistiek — de priors en de modelvalidatie — is niet af**, en op een
manier die niet zichtbaar is aan de buitenkant: het model *convergeert*, de kwaliteitspoort
zegt `pass`, en het dashboard geeft budgetadvies. Terwijl de priors systematisch een
verkeerde media/baseline-splitsing afdwingen.

### 1.2 De belangrijkste problemen

Vier dingen zijn fundamenteel:

1. **De priors schalen niet mee met het model.** De intercept-prior is gecentreerd op de
   *mediaan van de KPI* — alsof marketing niets bijdraagt — en elk kanaal krijgt daar
   bovenop een strikt positieve `HalfNormal(0.5)`. Gemeten op de eigen defaults: bij 5
   kanalen ligt de prior-verwachte KPI op **1,65× de waargenomen maximum-KPI**, bij 8
   kanalen op **2,28×**; de kans dat de prior-predictive boven het waargenomen maximum
   uitkomt is respectievelijk **93%** en **~100%**. Het model start dus met een prior die
   het dubbele van de werkelijkheid verwacht, en lost dat conflict op door de intercept
   (zelf strak begrensd, σ=0,25) omlaag te duwen — met **structurele over-attributie aan
   media** als gevolg. Dit raakt élk resultaat en élk budgetadvies dat de app ooit geeft.

2. **Een fit die technisch slaagt, kan zijn eigen resultaat verliezen.** `mape` wordt `NaN`
   zodra één KPI-week 0 is; `roas` wordt `NaN` bij een kanaal met 0 spend. `json.dumps`
   schrijft dan een letterlijke `NaN` — invalide JSON — en de Postgres-insert faalt. Het
   resultaat van een fit van vijf minuten is dan weg, en de job wordt als `failed` gemarkeerd
   met een onbegrijpelijke foutmelding. Voor een leads-/orders-KPI (waar nul-weken normaal
   zijn) is dit geen randgeval maar het normale geval.

3. **De AI mag te veel.** De architect-tool `propose_model_config` exposeert élke prior
   (`beta_sigma`, `halfsat_a/b`, `intercept_sigma`, `season_sigma`, `noise_sigma`, …) én
   `calibration {roas, sd}` — een `pm.Potential` die de uitkomst rechtstreeks naar een getal
   trekt. De enige validatie in `jobspec.py` is `float(v)`. En `/api/fit-refine` voert
   LLM-output **zonder mens-in-de-lus** uit: de tool-output gaat direct als job-config de
   database in (de rondelimiet komt zelfs uit `body.round` van de client, dus die is triviaal
   te omzeilen).

4. **"Sampling klaar" wordt behandeld als "model goed".** De kwaliteitspoort toetst R-hat,
   ESS, divergenties, dekking, R² en of de decompositie optelt — maar niet of de
   kanaaleffecten *identificeerbaar* zijn. Cross-validatie en de placebo-test staan standaard
   uit en worden door de flow nooit aangezet. De prior-predictive check blokkeert niets.
   Publiceren kent géén kwaliteitspoort, en het klantdashboard toont het oordeel nergens —
   maar geeft wél concreet budgetadvies ("verschuif €X van A naar B").

### 1.3 Wat moet fundamenteel veranderen?

| # | Verandering | Waarom |
|---|---|---|
| 1 | **Schaal-bewuste, hiërarchische priors** met een expliciet baseline/media-budget | Zonder dit is elk cijfer systematisch scheef |
| 2 | **Prior-predictive check als harde poort** vóór elke fit | Maakt (1) controleerbaar in plaats van hoopvol |
| 3 | **Modelvalidatielaag met vier niveaus** (technisch geslaagd / statistisch geldig / bruikbaar / onzeker) incl. identificeerbaarheid | "Sampling klaar" ≠ goed model |
| 4 | **AI-grens hard maken**: LLM stelt *intent* voor, deterministische code vertaalt naar priors | Statistiek mag niet van vrije LLM-output afhangen |
| 5 | **Reproduceerbare `ModelRun`-entiteit** met dataset-hash, config-snapshot, seed, versies | Nu is een run na het verwijderen van de job niet meer reconstrueerbaar |
| 6 | **Expliciete job-state-machine met idempotency** | Nu kan één job twee keer draaien |
| 7 | **Eenheidsbewuste kanalen** (euro's vs. GRP's/impressies/verzendingen) | De budgetoptimalisatie telt nu euro's en verzendingen bij elkaar op |
| 8 | **Publicatiepoort + onzekerheid zichtbaar op het klantdashboard** | Een `fail`-model mag niet stil naar de klant |

### 1.4 Gewenst eindresultaat

Een MVP-kern waarin een marketeer één schone CSV uploadt en de applicatie hem
deterministisch naar een **verantwoord** model leidt — waarbij de app zelf weet, en zegt,
of het model betrouwbaar genoeg is voor de vraag die de gebruiker stelt. Concreet:

```
CSV → DatasetVersion (gehasht, onveranderlijk)
    → Deterministische geschiktheidsvalidatie (blocking / warning / info)
    → Variabele-identificatie (AI stelt voor, deterministische checks beslissen)
    → ModelConfiguration (typed, gevalideerd, versioned)
    → Prior-predictive poort  ← blokkeert hier, vóór er compute wordt gespendeerd
    → ModelRun (idempotent, reproduceerbaar)
    → Diagnostics + identificeerbaarheid + out-of-sample
    → ModelValidation (4 niveaus, per-kanaal, met redenen)
    → Results (per-kanaal alleen vrijgegeven wat identificeerbaar is)
    → AI-interpretatie (leest alleen gestructureerde output, verzint niets)
    → UI
```

---

## 2. Huidige architectuur

### 2.1 Componentenkaart

```
Browser (Next.js 14 App Router, RSC + client components)
  │
  ├── Supabase JS (publishable key, RLS als gebruiker)
  │     ├── directe upload naar Storage-bucket `mmm-raw-data`
  │     ├── directe INSERT/UPDATE op mmm.source_files (mapping, inspection_confirmed_at)
  │     └── Realtime op mmm.{datasets,jobs,model_runs,data_inspections}
  │
  └── /api/* (Next route handlers, server-side Supabase client op request-cookies)
        ├── /api/datasets            → maakt dataset-rij + 'prepare'-job
        ├── /api/jobs                → maakt 'fit' | 'fit_hierarchical' | 'prior_predictive'-job
        ├── /api/datasets/[id]/approve, /confirm-tuning, /column-notes
        ├── /api/projects/[id]/publish → RPC mmm.publish_run()
        ├── /api/projects/demo       → demo-project met meegeleverde CSV
        └── AI-routes → Anthropic API
              /api/chat (NDJSON-stream), /api/classify-columns (Haiku),
              /api/inspect (code_execution, waitUntil), /api/analysis (code_execution),
              /api/client-summary, /api/prepare-auto, /api/fit-refine
                                    │
Supabase Postgres — schema `mmm` ───┘
  projects · project_access · app_users · source_files · datasets · jobs ·
  model_runs · chat_messages · data_inspections · project_context
  + RLS (builder = alles, client = alleen gepubliceerde runs van toegewezen projecten)
  + Storage: mmm-raw-data (bronnen + master-CSV), mmm-artifacts (.nc trace)
                                    │
Modal (`mmm-worker`) ───────────────┘  service_role key (RLS-bypass)
  enqueue (web endpoint) · poll_queue (elke minuut) · run_fit (cpu=4, mem=8G, timeout 30m)
    dispatch op jobs.type:
      'prepare'          → run_prepare()          (samenvoegen + kwaliteitsrapport)
      'fit'              → run_job()              (ingestie → PyMC NUTS → summary)
      'fit_hierarchical' → run_hier_job()
      'prior_predictive' → run_prior_predictive()
                                    │
packages/mmm-core (geïnstalleerd in het Modal-image) ─┘
  ingestion/ (pipeline, dates, quality, transforms, features, events)
  transforms/ (adstock, saturation)
  model/ (config, build, fit, predict, simulate, validation, hierarchical)
  evaluation.py · optimize.py · features.py
```

### 2.2 Dataflow van CSV tot dashboard (zoals het nu werkt)

1. **Upload** — `lib/wizard/turns/upload.ts` doet de upload *client-side* rechtstreeks naar
   Storage, parseert de CSV in de browser met PapaParse, berekent `SourceProfile`
   (`lib/dataProfile.ts`) en INSERT't de `source_files`-rij met `preview` (15 regels) +
   `profile`. Daarna fire-and-forget `/api/classify-columns`.
2. **Classificatie** — Haiku krijgt de 15 regels + het profiel en geeft per kolom een rol
   (`date|kpi|spend|control|ignore`), eenheid, granulariteit en layout terug. Opgeslagen als
   `source_files.mapping`.
3. **Inspect-fase** — de wizard toont de mapping als tekst; de gebruiker typt "1" om te
   bevestigen (`inspection_confirmed_at`), "2" om vrij-tekst te corrigeren (nieuwe
   Haiku-call), of "3" voor de diepe inspectie (`/api/inspect` → code_execution-sandbox).
4. **Prepare** — de architect stelt via `propose_prepare_recipe` een `PrepareRecipe` voor;
   de gebruiker typt "ja"; `/api/datasets` maakt een `datasets`-rij (`preparing`) + een
   `prepare`-job. De worker draait `build_master_dataset`, schrijft de master-CSV naar
   `mmm-raw-data` en zet `quality` + `preview` op de dataset-rij.
5. **Review + approve** — kwaliteitsrapport tonen; `/api/datasets/[id]/approve` zet
   `status='approved'`.
6. **Context** — vrije tekst + getypeerde feiten → `mmm.project_context`; marge →
   `projects.kpi_margin`.
7. **Tuning** — menu met drie opties: AI laten optimaliseren (→ architect-call →
   `propose_model_config`), zelf beschrijven, of een gratis proefdraai
   (`prior_predictive`-job).
8. **Fit** — bij "ja" op een config-voorstel: `confirm-tuning` (persisteert `tuning_draft`)
   + `/api/jobs` met de LLM-config. De worker downloadt de master, draait *opnieuw* de
   volledige ingestie, fit met numpyro NUTS, schrijft `summary` naar `model_runs` en de
   `.nc` naar `mmm-artifacts`.
9. **Review** — `SummaryView` + `layeredTrustVerdict` (sampler-laag vs. fit-laag),
   run-historie, vergelijken, analyse genereren, klantsamenvatting, auto-verbeteren
   (`/api/fit-refine`), publiceren.
10. **Klantdashboard** — `/dashboard/[projectId]` toont de gepubliceerde run met
    scenarioplanner.

### 2.3 Model-lifecycle zoals die nu is

```
jobs.status:   queued → running → succeeded | failed | cancelled
jobs.progress: null → downloading → building_dataset → sampling → saving
datasets.status: draft → preparing → prepared → failed | approved
```

`jobs.progress` heeft een DB-check-constraint op precies die vier waarden; `update_progress`
slikt fouten stil. `jobs.attempts` bestaat maar wordt nooit opgehoogd — er is geen
retry-mechanisme. `cancelled` bestaat in het enum maar wordt door niets gezet.

---

## 3. Gevonden problemen

Prioritering: **P0** = kan fundamenteel verkeerde resultaten opleveren, data verliezen of is
een security-probleem. **P1** = betrouwbaarheid/architectuur. **P2** = belangrijke
verbetering. **P3** = nice-to-have.

### 3.1 Critical bugs

| ID | P | Bevinding | Bewijs / locatie |
|----|---|-----------|------------------|
| C1 | **P0** | **Een geslaagde fit verliest zijn resultaat door `NaN` in de JSON.** `mape = np.mean(|resid| / where(kpi != 0, |kpi|, nan))` gebruikt `np.mean`, niet `np.nanmean` → één KPI-week met waarde 0 maakt de hele MAPE `NaN`. `roas` wordt expliciet `contrib * np.nan` bij een kanaal met 0 totale spend. `json.dumps({"mape": nan})` levert `{"mape": NaN}` — invalide JSON; PostgREST/Postgres jsonb weigert dat. `save_model_run` gooit, de outer `except` in `run_job` markeert de job als `failed`, en het fitresultaat is definitief weg. **Geverifieerd.** | `fit.py:552` (`mape`), `fit.py:509` (`roas`), `supabase_backends.py:save_model_run` |
| C2 | **P0** | **Jobs zijn niet idempotent.** `poll_queue` spawnt élke minuut álle rijen met `status='queued'` zonder ze te claimen; `run_job` doet `mark_running` zonder compare-and-set. Een job die door cold start >60 s in `queued` staat wordt dubbel gespawnd → twee fits, twee `model_runs`-rijen voor één `job_id`, dubbele Modal-kosten. | `modal_app.py:poll_queue`, `runner.py:run_job`, `supabase_backends.py:mark_running` |
| C3 | **P0** | **`/api/fit-refine` voert LLM-output direct uit.** De tool-output gaat rechtstreeks als `config` de `jobs`-tabel in — inclusief alle priors, `calibration` en `sources[].storage_path`. De comment claimt "Mens-in-de-lus blijft" maar er is geen bevestigingsstap. De rondelimiet leest `body.round` van de client → altijd `round: 1` sturen omzeilt 'm volledig. | `app/api/fit-refine/route.ts:38,213-220` |
| C4 | **P1** | **`/api/inspect` kan de gebruiker permanent vastzetten.** `maxDuration = 120` begrenst request + `waitUntil` samen, terwijl de eigen tekst zegt "kan een paar minuten duren". Bij overschrijding blijft de rij op `status='running'`; de inspect-turn weigert een nieuwe inspectie zolang die status geldt → doodlopende straat zonder herstelknop. Bovendien gebruikt de achtergrondtaak `createClient()` (cookie-gebonden) ná het antwoord. | `app/api/inspect/route.ts:24,120-200`, `lib/wizard/turns/inspect.ts:193` |
| C5 | **P1** | **`nudgeModalEnqueue` werkt niet.** `enqueue(job_id: str)` is via `modal.fastapi_endpoint` een *query*-parameter (FastAPI-conventie voor scalaire types); de app POST't `{job_id}` als JSON-body → 422, stil opgevangen door de `catch {}`. Elke job wacht dus altijd op de 1-minuut poll. | `lib/jobs.ts:nudgeModalEnqueue`, `modal_app.py:enqueue` |
| C6 | **P1** | **Chatgeschiedenis is ongelimiteerd en wordt bij elke beurt volledig meegestuurd.** `chat_messages` wordt nooit afgekapt of samengevat. Kosten en latency groeien lineair; uiteindelijk contextlimiet → harde fout zonder herstelpad. En: `GET /api/chat` (die de historie teruggeeft) wordt door **geen enkele client** aangeroepen — na een refresh ziet de gebruiker een leeg venster terwijl Claude alles nog "onthoudt". | `app/api/chat/route.ts:handleGet` (dood), `ChatWizard.tsx:204` |
| C7 | **P2** | `optimize_budget`/`optimize_budget_count` controleren `res.success` van SLSQP niet; bij niet-convergeren wordt `res.x` alsnog als "optimale allocatie" gepresenteerd. De hele `_planning_outputs` zit in een kale `except Exception: pass`, dus een stille mislukking is onzichtbaar. | `optimize.py:optimize_budget`, `fit.py:_planning_outputs` |
| C8 | **P2** | `recommendedActions` vergelijkt `sum(mediaan per kanaal)` met `mediaan(som over de posterior)` — twee verschillende schatters. Een "winst van X per week" kan puur een artefact van die mismatch zijn. | `lib/dashboardInsights.ts:recommendedActions` |
| C9 | **P2** | `prior_predictive_check` vermenigvuldigt de prior-trekkingen met `y_max`, ook bij count-likelihoods waar `y` niet geschaald is → het gerapporteerde prior-bereik is dan met een factor `y_max` verkeerd. | `evaluation.py:prior_predictive_check` |

### 3.2 Statistische / MMM-problemen

| ID | P | Bevinding |
|----|---|-----------|
| **S1** | **P0** | **Priors schalen niet met het aantal kanalen → systematische over-attributie aan media.** `intercept ~ N(mediaan(y_scaled), 0,25)` centreert de baseline op de héle KPI, alsof media niets bijdraagt. Daar bovenop krijgt elk kanaal `beta ~ HalfNormal(0,5)` — strikt positief, dus alleen optellend. Monte-Carlo op de eigen defaults (200k trekkingen), met de KPI genormaliseerd zodat de waargenomen max exact 1,0 is:<br><br>`kanalen=1 → prior-gemiddelde KPI 0,81 · P(>max) = 25%`<br>`kanalen=3 → 1,23 · 71%`<br>`kanalen=5 → 1,65 · 93%`<br>`kanalen=8 → 2,28 · ~100%`<br><br>De prior verwacht dus bij een normaal MMM (5–8 kanalen) een KPI van 1,6–2,3× het waargenomen maximum. De posterior moet dat conflict oplossen; omdat `beta` niet negatief kán en de intercept zelf strak begrensd is (σ=0,25), komt de correctie deels uit de media-coëfficiënten en deels uit een te lage baseline. **Dit vervuilt elke contributie, elke ROAS en elk budgetadvies.** Locatie: `model/build.py:intercept`, `model/config.py:ChannelPriors.beta_sigma`, `BaselinePriors.intercept_sigma`. |
| **S2** | **P0** | **`halfsat ~ Beta(2,2)` op max-geschaalde spend legt verzadiging op.** Het halfverzadigingspunt ligt per constructie in `(0, 1)` × de historische max weekspend: mediaan 0,50× max, `P(halfsat > 0,9 × max) = 2,8%`. Het model **kan niet uitdrukken** dat een kanaal nog ver van verzadiging zit. Gevolg: mROAS wordt systematisch onderschat, de responscurves buigen te vroeg af, en de budgetoptimalisatie adviseert structureel afvlakken/verschuiven waar opschalen juist zou lonen. Locatie: `model/build.py:_saturation_rvs`, `config.py:halfsat_a/halfsat_b`. |
| **S3** | **P0** | **Seizoensconfounding is ingebakken.** `season_sigma = 0,1` is een vaste constante op de `[0,1]`-geschaalde KPI, ongeacht de werkelijke seizoensamplitude. Bij een retailer met een 3–5× decemberpiek is de seizoensterm veel te strak om die piek op te vangen — en omdat mediadruk in december ook piekt, **komt die piek bij media terecht**. Er is geen mechanisme dat de seizoenspriors uit de data kalibreert, en geen check die dit signaleert. Locatie: `config.py:BaselinePriors.season_sigma`. |
| **S4** | **P0** | **Budgetoptimalisatie mengt eenheden.** `optimize_budget` verdeelt één "totaal weekbudget" (`sum(mean spend)` over álle kanalen) opnieuw. De eigen demo-dataset heeft `email_verzendingen` als kanaal; GRP's en impressies worden expliciet ondersteund. Euro's en verzendingen bij elkaar optellen tot een budget en dat herverdelen is betekenisloos, net als "ROAS = KPI per verzending". `ColumnMapping` heeft een `unit`-veld — dat wordt nergens gebruikt om dit te voorkomen. Locatie: `optimize.py`, `fit.py:_planning_outputs`, `demo_data/mediamarkt_demo_dataset.csv`. |
| **S5** | **P1** | **Adstock-burn-in wordt niet afgehandeld.** De convolutie zero-padt het begin: de eerste `l_max` weken missen de pre-window-spend, dus hun adstock-stock is systematisch te laag. Met de default `l_max=12` op een dataset van 60 weken is 20% van de observaties vertekend. Geen burn-in-drop, geen pre-periode, geen waarschuwing. Locatie: `build.py:_pt_convolve`, `transforms/adstock.py`. |
| **S6** | **P1** | **De kwaliteitspoort toetst geen identificeerbaarheid.** `_quality_gate` kijkt naar R-hat, divergenties, ESS, dekking, R² en de decompositie. Niet naar: is de posterior van `beta_c` te onderscheiden van de prior? Is de posterior-correlatie tussen twee kanalen extreem (het klassieke MMM-symptoom van niet-scheidbare kanalen)? Is het 94%-interval van een kanaalbijdrage zo breed dat de schatting niets zegt? Een model waarin search-brand en search-generic niet te scheiden zijn haalt gewoon `pass`. Locatie: `fit.py:_quality_gate`. |
| **S7** | **P1** | **De collineariteitswaarschuwing verdwijnt.** `_flag_multicollinearity` (VIF ≥ 10) en `_flag_near_identical` (|r| ≥ 0,95) draaien in de dataprep en komen op `datasets.quality`. Op het moment dat er per-kanaal-ROAS wordt getoond — in `SummaryView` en op het klantdashboard — is die waarschuwing volledig uit beeld. Locatie: `pipeline.py` vs. `components/SummaryView.tsx`, `app/dashboard/[projectId]/page.tsx`. |
| **S8** | **P1** | **De enige echte out-of-sample-toets staat standaard uit en wordt nooit aangezet.** `EvaluationSpec.cross_validation` en `.placebo` defaulten op `false`; geen enkel pad in de wizard zet ze aan. `_quality_gate` krijgt dus in de praktijk nooit `cv_mape` of `placebo_ok`. Het model wordt uitsluitend in-sample beoordeeld. Locatie: `jobspec.py:EvaluationSpec`, `runner.py:_run_extra_evaluations`, `lib/wizard/tuningDefaults.ts`. |
| **S9** | **P1** | **De prior-predictive check blokkeert niets.** De uitkomst gaat naar `jobs.prior_predictive` en wordt als tekst aan de architect gegeven. Er is geen enkele blokkade als `admits_observed = false`. Gegeven S1 zou deze check bij vrijwel elk model met ≥3 kanalen moeten afgaan — hij is er, maar hij doet niets. Locatie: `prior_predictive.py`, `app/api/jobs/route.ts`. |
| **S10** | **P1** | **Een kanaal zonder variatie faalt stil.** `x_max_safe = where(x_max > 0, x_max, 1.0)` → een all-zero kanaal krijgt contributie 0, `beta` blijft ongeïdentificeerd bij de prior, en `roas` wordt `NaN` (→ C1). De ingestie waarschuwt (`all_zero_channel`) maar `build_model` blokkeert niet. Idem voor een bijna-constant kanaal: geen enkele variatiedrempel. Locatie: `build.py:build_model`. |
| **S11** | **P1** | **`likelihood` en KPI-type worden niet gekoppeld.** De AI kiest de likelihood vrij. Er is geen deterministische check die "KPI is integer en klein → count-likelihood" of "KPI is continu → geen Poisson" afdwingt. `build_model` weigert wel een niet-integer KPI bij een count-likelihood, maar dat is een crash tijdens de fit, geen validatie vooraf. |
| **S12** | **P2** | `optimize_budget` optimaliseert op de **mediaan**-parameters en hangt daarna een credible interval aan de resulterende allocatie. Dat is een plug-in-optimum: de allocatie is optimaal voor één punt in de posterior, niet onder onzekerheid. Systematisch overmoedig, precies waar de gebruiker budget op stuurt. |
| **S13** | **P2** | De master-CSV gaat bij de fit nog een keer volledig door `build_master_dataset` — inclusief opnieuw imputeren, opnieuw VIF, opnieuw outlierdetectie — op al-geaggregeerde data. Dubbel werk en dubbele/misleidende waarschuwingen. |
| **S14** | **P2** | `_HILL_EPS` staat in de PyTensor-Hill maar niet in de numpy-`hill_saturation`. `predict.py` compenseert handmatig (`+_HILL_EPS`), `optimize.py` heeft een eigen kopie van de constante. Drie plekken die synchroon moeten blijven, zonder test die dat afdwingt. |
| **S15** | **P2** | Er is geen model-baseline om tegen af te zetten. Er wordt geen "geen media"-nulmodel of eenvoudige regressie gefit, dus "R² = 0,62" heeft geen referentie. `compare_models` (LOO) bestaat maar wordt nergens aangeroepen. |

### 3.3 Architectuurproblemen

| ID | P | Bevinding |
|----|---|-----------|
| A1 | **P0** | **Geen tenant-model.** Er zijn precies twee rollen: `is_builder` (ziet en muteert *alles*, elk project van elke klant) en `client` (leest gepubliceerde runs van toegewezen projecten). Geen organisatie, geen workspace, geen `owner_id`-scoping op `projects`. Voor een SaaS waarin "gebruikers elkaar nooit mogen beïnvloeden" is dit geen isolatie. |
| A2 | **P0** | **`storage_path` is volledig client-/LLM-bepaald.** `/api/jobs` accepteert een willekeurige `config` en slaat 'm verbatim op; de worker downloadt die paden met de **service_role** key (RLS-bypass). Geen server-side check dat het pad bij het project hoort. Vandaag beperkt door A1 (elke builder mag toch alles), maar het is een IDOR-by-design zodra er meer dan één tenant is. |
| A3 | **P1** | **De job-config wordt nergens server-side gevalideerd vóór hij de queue in gaat.** Validatie gebeurt pas in de worker, minuten later. Een onbruikbare config kost dus een container-start en een `failed`-job in plaats van een directe 400 met een begrijpelijke melding. |
| A4 | **P1** | **`MAX_CONCURRENT_JOBS = 2` is globaal en race-gevoelig.** De check telt jobs over álle projecten en álle gebruikers samen, met een TOCTOU-gat (twee gelijktijdige requests zien allebei ruimte). Als SaaS-limiet is 2 geen limiet maar een blokkade. |
| A5 | **P1** | **Geen retry-laag.** `jobs.attempts` bestaat maar wordt nooit opgehoogd. Een transiënte storing (Storage-timeout, Modal-preemptie) is meteen een definitieve `failed`. `cancelled` bestaat in het enum en wordt door niets gezet — annuleren kan niet. |
| A6 | **P1** | **De statussen zijn te grof en niet uitbreidbaar.** `jobs.progress` heeft een DB-check-constraint op `downloading|building_dataset|sampling|saving`; `update_progress` slikt fouten stil, dus een nieuwe fase zou onzichtbaar wegvallen. De gevraagde state machine (VALIDATING, VALIDATING_MODEL, CALCULATING_RESULTS) past er niet in. |
| A7 | **P1** | **Twee schrijvers op dezelfde state.** De browser schrijft rechtstreeks naar `source_files` (mapping, `inspection_confirmed_at`) en naar Storage; de API-routes en de worker schrijven ook. Er is geen enkele plek die de toestandsovergangen bewaakt. |
| A8 | **P2** | **`derivePhase` gaat uit van precies één bronbestand** (`sources[0]`), terwijl DB, recept, `PrepareRecipe` en worker meerdere bronnen ondersteunen. Een tweede upload maakt de fase-afleiding onbetrouwbaar. |
| A9 | **P2** | **Een nieuwe upload invalideert niets.** Upload je na een geslaagde run een nieuw bestand, dan blijft de fase `review`/`published` en blijft het oude resultaat als "het" resultaat staan. Er is geen "je data is veranderd, dit model hoort bij de oude data"-signaal. |
| A10 | **P2** | **Hiërarchisch/multi-region is dode code in productie.** `run_hier_job`, `HierSummary`, `HierarchicalSummaryView` en `build_master_datasets_by_region` bestaan volledig, maar er is geen enkel pad in de UI dat een `fit_hierarchical`-job kan aanmaken (de upload-flow ondersteunt één bestand, geen regiodimensie). ~400 regels productiecode + tests die niets doen. |
| A11 | **P2** | **Documentatie beschrijft componenten die niet bestaan:** `store/`, `JobList`, `SourceUpload.tsx`, `lib/dataHealth.ts`, `lib/pipelineStatus.ts`, `ChatPanel`. `MMM_README.md`, `MMM_APP_OVERDRACHTSDOCUMENT.md` (874 r.), `SIMPLIFICATION_PLAN.md` en `MMM_HANDLEIDING_DATA_ANALIST.md` (723 r.) zijn vier deels tegenstrijdige documenten over dezelfde applicatie. |

### 3.4 Data-integriteit

| ID | P | Bevinding |
|----|---|-----------|
| D1 | **P0** | **Er is geen reproduceerbaarheidsketen.** `model_runs.dataset_id` bestaat als kolom maar wordt door de worker **nooit gevuld** (`save_model_run` schrijft 'm niet). De config staat alleen op `jobs` met FK `on delete set null` → job weg = run niet meer reconstrueerbaar. Niet vastgelegd: code-versie, package-versies (pymc/numpyro/arviz), dataset-hash, effectieve seed, worker-image-digest. |
| D2 | **P1** | **Geen dataset-versiebeheer met immutability.** Elke prepare maakt een nieuwe `datasets`-rij, wat goed is, maar niets voorkomt dat de master-CSV wordt overschreven (`upsert: "true"` in `SupabaseStorage.upload`) en er is geen inhoudshash. "Welk model hoort bij welke datasetversie" is niet te beantwoorden. |
| D3 | **P1** | **Kolomrollen zijn pure LLM-output zonder deterministische kruiscontrole.** `parseColumnMapping` valideert alleen de enum-waarden. Er is geen check dat een `spend`-kolom numeriek en ≥0 is, dat de `date`-kolom parseert, dat de `kpi`-kolom niet constant is, of dat een kolom geen ID is (hoge cardinaliteit, monotoon oplopend). `validMapping` telt alleen hoeveel kolommen elke rol hebben. Een ID-kolom die als `spend` wordt geclassificeerd komt gewoon als kanaal in het model. |
| D4 | **P1** | **Halverwege gefaalde upload laat rommel achter.** `uploadSourceFile` doet eerst de Storage-upload, dan de rij-insert. Faalt de insert, dan blijft het bestand in de bucket staan zonder rij. Er is geen opruiming en geen transactie. |
| D5 | **P2** | **Encoding wordt niet afgehandeld.** De browser leest met `file.text()` (UTF-8 aangenomen); de worker doet `pd.read_csv(BytesIO)` (UTF-8) met als enige fallback `sep=";"`. Een Latin-1/CP1252-export (in NL nog steeds gangbaar) mislukt of levert mojibake in kolomnamen — waardoor de kolomnamen in de config niet meer matchen. |
| D6 | **P2** | **Dubbel migratienummer:** `0012_company_context.sql` én `0012_eda_completed.sql`. Volgorde is niet gedefinieerd. |
| D7 | **P2** | **Dode kolommen:** `jobs.attempts`, `projects.eda_completed_at` (de EDA-stap bestaat niet meer), `source_files.role_hint`, `model_runs.dataset_id` (nooit gevuld). |
| D8 | **P2** | De `datasets`-tabel heeft geen unieke constraint op "één actieve/approved dataset per project". Twee `approved` datasets naast elkaar is mogelijk; `derivePhase` neemt gewoon de nieuwste. |

### 3.5 Worker / infrastructuur

| ID | P | Bevinding |
|----|---|-----------|
| W1 | **P0** | C2 (geen idempotency) — zie §3.1. |
| W2 | **P1** | **De `enqueue`-endpoint is onbeveiligd.** `@modal.fastapi_endpoint(method="POST")` zonder auth: iedereen die de URL kent kan `run_fit` spawnen voor een willekeurige job-id. Gecombineerd met W1 een gratis manier om Modal-compute te verstoken. |
| W3 | **P1** | **De trace-upload is silent-fail.** Mislukt de `.nc`-upload, dan wordt `artifact_path = None` en de run wordt alsnog als succesvol opgeslagen — zonder enig spoor dat de ruwe posterior ontbreekt. Daarmee is de run definitief niet meer te heranalyseren. |
| W4 | **P1** | **`_run_extra_evaluations` slikt alles.** Drie kale `except Exception: pass` — als de cross-validatie of placebo-test faalt, wordt de check gewoon overgeslagen en verschijnt de kwaliteitspoort alsof hij niet gevraagd was. |
| W5 | **P2** | **Geen timeout-differentiatie.** `RUN_TIMEOUT_SECONDS = 30 min` geldt voor een `prepare`-job van 5 seconden net zo goed als voor een fit met CV. De reaper wacht daarna nog 5 minuten (`STALE_RUNNING_SECONDS`), dus een gecrashte prepare blokkeert een slot 35 minuten. |
| W6 | **P2** | **`pymc-marketing>=0.7` staat in de dependencies maar wordt nergens geïmporteerd.** Zware, ongebruikte dependency in het Modal-image (langere buildtijd, groter image). |
| W7 | **P2** | **`read_table` is te naïef.** `pd.read_csv` → bij exception `sep=";"`. Geen encoding-detectie, geen `decimal=","`, geen expliciete `dtype`-controle, geen limiet op bestandsgrootte in de worker. |
| W8 | **P2** | Geen gestructureerde logging in de worker (alleen returns + `jobs.error`). Bij een productiefout is er niets terug te zoeken behalve de Modal-containerlog. |

### 3.6 AI

| ID | P | Bevinding |
|----|---|-----------|
| AI1 | **P0** | **De AI mag élke prior zetten, zonder numerieke validatie.** `propose_model_config` exposeert `beta_sigma`, `adstock_concentration`, `delayed_peak_weeks/sigma`, `hill_slope_a/b`, `halfsat_a/b`, `logistic_lam_sigma`, `intercept_sigma`, `trend_sigma`, `season_sigma`, `control_sigma`, `noise_sigma`, `changepoint_scale`. `jobspec.py` doet uitsluitend `float(v)` — geen bereik, geen plausibiliteitscheck, geen prior-predictive-hercontrole. Eén verkeerd getal (`beta_sigma: 5`) kantelt het hele resultaat. |
| AI2 | **P0** | **De AI mag een ROAS-kalibratie verzinnen.** `calibration {roas, sd}` wordt een `pm.Potential` die de uitkomst rechtstreeks naar een getal trekt — de sterkste knop in het hele model. De tooltekst zegt "alleen bij een echt experiment", maar er is geen enkele afdwinging: een terloopse opmerking van de gebruiker ("volgens mij levert TV zo'n 3× op") kan als experiment worden vastgelegd en het model sturen. |
| AI3 | **P0** | AI3 = C3: `/api/fit-refine` voert LLM-config uit zonder bevestiging. |
| AI4 | **P1** | **Kolomsemantiek is een LLM-oordeel.** De classificatie ziet 15 preview-regels + het profiel; de gebruiker bevestigt met "1". Zie D3 — geen deterministische kruiscontrole. Dit bepaalt wat de KPI is. |
| AI5 | **P1** | **Prompt-injectie via datasetinhoud.** Kolomnamen en de eerste 15 CSV-regels gaan letterlijk in de prompt van `/api/classify-columns` en in de architect-context, zonder scheiding tussen instructie en data. Een geprepareerde kolomnaam kan de classificatie sturen. |
| AI6 | **P1** | **De architect kan een model "goed" praten.** Hij krijgt de volledige `FitSummary` inclusief kwaliteitspoort en schrijft er vrije tekst over. Er is geen deterministische regel die zegt "bij `verdict=fail` mag het antwoord niet aanbevelend zijn". `client_summary` (de klantpresentatie!) wordt op dezelfde manier gegenereerd. |
| AI7 | **P2** | **Modelroutering is een no-op.** `ARCHITECT_CONFIG_MODEL` en `ARCHITECT_ANALYST_MODEL` wijzen allebei naar `claude-sonnet-5`; `needsAnalysis` berekent een keuze die geen effect heeft. |
| AI8 | **P2** | **Geen kostenbewaking op AI.** Geen rate-limit per gebruiker/project, geen tokenbudget, geen dagelijkse cap. Gecombineerd met C6 (ongelimiteerde historie) en C3 (omzeilbare rondelimiet) is dat een open kostenrisico. |
| AI9 | **P2** | `parseBusinessContextInput` en `parseColumnMapping` "droppen wat misvormd is" — een stille reductie van AI-output zonder enig signaal naar de gebruiker. |

### 3.7 Security

| ID | P | Bevinding |
|----|---|-----------|
| SEC1 | **P0** | A1 — geen tenant-isolatie; elke builder ziet elk project van elke klant. |
| SEC2 | **P0** | A2 — `storage_path` uit client/LLM, gedownload met service_role. |
| SEC3 | **P1** | W2 — onbeveiligde Modal `enqueue`-endpoint. |
| SEC4 | **P1** | **Publishable key en Supabase-URL staan in `.env.local.example` en `MMM_PYTHON.env.example` in git.** Dat is voor de publishable key by design ongevaarlijk, maar het lekt wel de projectidentiteit (`pzpoptfljgrskebnuggt`) en daarmee het aanvalsoppervlak van de auth-endpoints. Bewust besluit vastleggen of weghalen. |
| SEC5 | **P1** | **Geen bestandsgrootte-/inhoudscontrole server-side.** De 50 MB-limiet zit alleen in de browser (`validateFile`); de upload gaat rechtstreeks naar Storage met de user-key. Een client die de UI omzeilt kan uploaden wat hij wil; de worker leest dat vervolgens met `pd.read_csv` in het geheugen van een 8 GB-container. |
| SEC6 | **P2** | `datasets_builder_all` (migratie 0005) is niet met `to authenticated` beperkt, terwijl 0002 dat voor alle andere policies wél expliciet deed. Functioneel veilig (`is_builder()` is `false` voor anon) maar inconsistent en het triggert de Supabase-advisor. |
| SEC7 | **P2** | AI5 — prompt-injectie via datasetmetadata. |
| SEC8 | **P2** | `model_runs.analysis` bevat base64-PNG's in jsonb. Die worden gegenereerd door code_execution op basis van de FitSummary en ongefilterd in het klantdashboard gerenderd. Geen grootte-limiet, geen contentcheck. |
| SEC9 | **P3** | De middleware-matcher `/((?!_next/static|_next/image|favicon.ico|auth).*)` draait de sessie-refresh ook op statische routes en de landingspagina — onnodige Supabase-calls, geen securityprobleem. |

### 3.8 Product / UX

| ID | P | Bevinding |
|----|---|-----------|
| U1 | **P0** | **Het klantdashboard toont het kwaliteitsoordeel niet en geeft toch budgetadvies.** `mmm.publish_run()` kent geen poort: een run met `verdict = "fail"` (niet geconvergeerd, decompositie klopt niet) kan gepubliceerd worden. Het dashboard rendert `SummaryView` inclusief `recommendedActions` ("Verschuif ± €X per week van A naar B") zonder enige waarschuwing over de betrouwbaarheid. |
| U2 | **P1** | **Chatgeschiedenis verdwijnt bij refresh** (C6) — de gebruiker verliest de draad terwijl de AI 'm wel houdt. |
| U3 | **P1** | **Doodlopende straat bij een vastgelopen inspectie** (C4). |
| U4 | **P1** | **Een technische foutmelding kan de gebruiker alsnog bereiken.** `mark_failed(job_id, f"{type(exc).__name__}: {exc}")` schrijft de ruwe Python-exception naar `jobs.error`; `fitFailedTurn` toont die via `humanizeError`, dat alleen bekende patronen vertaalt en de rest letterlijk doorgeeft. Een `KeyError: 'google_spend'` komt dus als zodanig in beeld. |
| U5 | **P1** | **De gebruiker kan de gebruikte configuratie nergens inzien.** Er is een "gebruik config van run N"-commando maar geen leesbare weergave van *wat* er is geconfigureerd. Voor de gevraagde transparantie ("de gebruiker moet begrijpen wat er gebeurt en waarom") is dat een gat. |
| U6 | **P2** | Er is één menupad per fase en de deterministische afhandeling valt bij niet-herkend antwoord terug op de architect. Dat is elegant, maar betekent ook dat een typefout in een menukeuze een betaalde LLM-call kost. |
| U7 | **P2** | `WaitingIndicator` toont na 12 minuten "ververs de pagina; blijft het hangen, controleer dan de worker-status" — een instructie die een marketeer niet kan uitvoeren. |
| U8 | **P2** | Er is geen enkele weergave van "hoe zeker weten we dit kanaal?" naast de intervallen zelf. `confidenceFromInterval` bestaat maar wordt niet gecombineerd met identificeerbaarheid (S6) — een kanaal dat niet te scheiden is van een ander kan een smal interval hebben en dus "hoog vertrouwen" heten. |

### 3.9 Technical debt

| ID | P | Bevinding |
|----|---|-----------|
| T1 | P2 | `npm run lint` staat in `package.json`, maar eslint zit niet in `devDependencies` en er is geen config. CI draait alleen `typecheck` + `build`. |
| T2 | P2 | Vier parallelle, deels achterhaalde documenten (A11). |
| T3 | P2 | Dode code: `GET /api/chat`, hiërarchische pad (A10), `mmm_core.model.simulate` (alleen in tests), `compare_models`, `allocate_incremental_budget`, `date_span_dummy`. |
| T4 | P2 | Het contract tussen TS en Python wordt handmatig gesynchroniseerd (`__contract_check.ts` ↔ `job_config_contract.json`) — een goed idee, maar zonder generator drift het onvermijdelijk. |
| T5 | P3 | `app/sander/` en `supabase/migrations/0020_sander_schema.sql` horen bij een andere applicatie in dezelfde repo. |
| T6 | P3 | Geen enkele frontend-test (geen jest/vitest/playwright). |

---

## 4. Doelarchitectuur

### 4.1 De keten

```
                    ┌─────────────────────────────────────────────┐
                    │ 1. UPLOAD (server-side, één transactie)      │
CSV ───────────────►│    hash → dedupe → Storage → source_files    │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 2. DETERMINISTISCHE GESCHIKTHEIDSVALIDATIE   │
                    │    (Python, in de worker — dezelfde code als │
                    │     de fit gebruikt; NIET in de browser)     │
                    │    → DatasetSuitabilityReport                │
                    │      blocking / warning / info, elk met een  │
                    │      gebruikerstekst + een concrete actie    │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 3. VARIABELE-IDENTIFICATIE                   │
                    │    AI stelt rollen voor  ──┐                 │
                    │                            ▼                 │
                    │    deterministische validator beslist:       │
                    │      • date  → moet parseren, ≥1 cadans      │
                    │      • kpi   → numeriek, niet-constant,      │
                    │                niet-negatief indien telling  │
                    │      • spend → numeriek, ≥0, variatie > drempel│
                    │      • unit  → euro | volume (verplicht)     │
                    │      • id-detectie → forceer 'ignore'        │
                    │    Conflict → vraag de gebruiker, niet de AI │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 4. DatasetVersion  (immutable, gehasht)      │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 5. MODELCONFIGURATIE                         │
                    │    AI levert INTENT (zie §8), niet getallen: │
                    │      { channel_role, expected_carryover,     │
                    │        expected_strength, saturation_belief, │
                    │        seasonality_belief, kpi_type }        │
                    │    PriorBuilder (deterministisch) vertaalt   │
                    │    intent + datastatistieken → priors        │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 6. CONFIGURATIEVALIDATIE (server-side, 400)  │
                    │    schema · bereiken · kolommen bestaan ·    │
                    │    storage_path hoort bij dit project ·      │
                    │    weken-per-parameter · unit-consistentie   │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 7. PRIOR-PREDICTIVE POORT  (blokkerend)      │
                    │    admits_observed ∧ ¬absurd ∧ media-aandeel │
                    │    in [5%, 80%]  →  anders: geen fit         │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 8. ModelRun (idempotent, gehashte inputs)    │
                    │    QUEUED → VALIDATING → PREPARING_DATA →    │
                    │    BUILDING_MODEL → SAMPLING →               │
                    │    VALIDATING_MODEL → CALCULATING_RESULTS →  │
                    │    COMPLETED | FAILED | CANCELLED            │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 9. DIAGNOSTICS + IDENTIFIABILITY             │
                    │    R-hat · ESS · divergenties · BFMI ·       │
                    │    PPC · residuen · prior/posterior-overlap ·│
                    │    posterior-correlatiematrix · VIF ·        │
                    │    holdout (altijd) · placebo (altijd)       │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 10. MODELVALIDATIE — 4 niveaus               │
                    │     TECHNICALLY_COMPLETED                    │
                    │     STATISTICALLY_VALID                      │
                    │     USABLE_FOR_DECISIONS                     │
                    │     UNCERTAIN / NOT_USABLE                   │
                    │     + per kanaal een eigen oordeel           │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 11. RESULTS — gefilterd op wat mag           │
                    │     Geen budgetadvies bij niet-USABLE.       │
                    │     Geen per-kanaal-ROAS bij een kanaal      │
                    │     dat niet identificeerbaar is.            │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ 12. AI-INTERPRETATIE (read-only, begrensd)   │
                    │     Krijgt alleen de gefilterde results +    │
                    │     het validatieoordeel. Mag uitleggen,     │
                    │     niet herclassificeren.                   │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                                     UI / dashboard
```

### 4.2 Kernprincipes van de doelarchitectuur

1. **Eén schrijver per toestand.** De browser schrijft nooit meer rechtstreeks naar
   `source_files`/`datasets`/`jobs`. Alle toestandsovergangen gaan via een route-handler die
   de overgang valideert. Storage-uploads gaan via een server-uitgegeven signed URL met een
   door de server bepaald pad.
2. **Statistiek is deterministisch, AI is adviserend.** De AI produceert nooit een getal dat
   direct in het model belandt. Zie §8.
3. **Alles wat een resultaat beïnvloedt, wordt gehasht en vastgelegd.** Zie §5.
4. **Blokkerende poorten vóór dure stappen.** Geschiktheidsvalidatie vóór prepare;
   configuratievalidatie vóór queue; prior-predictive vóór MCMC; modelvalidatie vóór
   resultaten; modelvalidatie vóór publicatie.
5. **Onzekerheid wordt nooit weggeschreven.** Als iets niet identificeerbaar is, wordt het
   niet getoond als getal — het wordt getoond als "dit kunnen we met deze data niet
   vaststellen", met de reden.

---

## 5. Datamodel

### 5.1 Entiteiten

```
organizations
  id, name, created_at
    │
    ├── memberships (org_id, user_id, role: owner|builder|analyst|client)
    │
    └── projects
          id, org_id, name, client_company, status, kpi_margin, created_by, …
            │
            ├── project_context      (1:1 — branche, omschrijving, feiten)
            │
            ├── source_files         (ruwe upload; onveranderlijk na insert)
            │     id, project_id, filename, storage_path, content_sha256,
            │     size_bytes, encoding, n_rows, n_columns, profile, created_at
            │
            ├── dataset_versions     ◄── VERVANGT `datasets`
            │     id, project_id, version_no (uniek per project),
            │     source_file_ids[], recipe (jsonb),
            │     status: building|ready|failed,
            │     master_path, master_sha256,          ← inhoudshash, onveranderlijk
            │     window_start, window_end, n_weeks, frequency,
            │     column_roles (jsonb), column_units (jsonb), column_notes,
            │     suitability (jsonb: DatasetSuitabilityReport),
            │     verdict: usable|usable_with_warnings|not_usable,
            │     approved_at, approved_by, created_at
            │
            ├── model_configurations ◄── NIEUW (nu impliciet in jobs.config)
            │     id, project_id, dataset_version_id (FK, NOT NULL),
            │     intent (jsonb: wat de AI/gebruiker bedoelde),
            │     resolved_spec (jsonb: de door PriorBuilder afgeleide ModelConfig),
            │     spec_sha256, prior_predictive (jsonb), prior_gate_passed (bool),
            │     created_by, created_at
            │
            ├── model_runs           ◄── VERVANGT `jobs` + `model_runs`
            │     id, project_id,
            │     model_configuration_id (FK, NOT NULL),
            │     dataset_version_id (FK, NOT NULL, gedenormaliseerd voor query's),
            │     idempotency_key (uniek) = sha256(spec_sha256 | master_sha256 | sample | seed)
            │     state (zie §6), state_changed_at, attempt, max_attempts,
            │     claimed_by, claimed_at, heartbeat_at,   ← idempotency/lease
            │     seed, sample_params (jsonb),
            │     engine_version, mmm_core_version, package_versions (jsonb),
            │     worker_image_digest,
            │     error_code, error_user_message, error_technical (alleen builder),
            │     started_at, finished_at, created_by, created_at
            │
            ├── model_diagnostics    ◄── NIEUW (los van results)
            │     model_run_id (PK/FK), convergence (jsonb), ppc (jsonb),
            │     identifiability (jsonb), out_of_sample (jsonb),
            │     residuals (jsonb), placebo (jsonb)
            │
            ├── model_validations    ◄── NIEUW (het oordeel, los van de metingen)
            │     model_run_id (PK/FK), level (4 niveaus), per_channel (jsonb),
            │     blocking_reasons[], warning_reasons[], allowed_outputs[] (jsonb),
            │     evaluated_at, ruleset_version
            │
            ├── model_results        ◄── de gefilterde, publiceerbare uitkomst
            │     model_run_id (PK/FK), summary (jsonb), weekly (jsonb),
            │     response_curves (jsonb|null), allocation (jsonb|null),
            │     inference_data_path, inference_data_sha256,
            │     is_published, published_at
            │
            ├── ai_interactions      ◄── VERVANGT `chat_messages` (met budget)
            │     id, project_id, thread_id, role, content, model,
            │     input_tokens, output_tokens, cost_estimate, created_at
            │
            └── data_inspections     (blijft, + heartbeat + timeout-reaper)
```

**Waarom deze splitsing:**

- `model_configurations` los van `model_runs` maakt "dezelfde config, andere seed" en
  "dezelfde config, nieuwe datasetversie" expliciet, en het `prior_gate_passed`-veld maakt
  de poort van §4 een harde, opvraagbare feit.
- `model_diagnostics` los van `model_validations` scheidt **meting** van **oordeel**. Het
  oordeel heeft een `ruleset_version`, zodat een strengere poort later niet stilzwijgend
  oude runs herwaardeert.
- `model_results` los van de run maakt "run geslaagd maar resultaten geblokkeerd" een
  representeerbare toestand — vandaag onmogelijk.
- `idempotency_key` uniek op `model_runs` lost C2 structureel op: een dubbele spawn kan geen
  tweede rij maken.

### 5.2 Constraints en indexen die er moeten komen

```sql
-- idempotency
unique (idempotency_key)
-- claim/lease (compare-and-set)
update model_runs set state='VALIDATING', claimed_by=$worker, claimed_at=now()
  where id=$id and state='QUEUED' and claimed_by is null;   -- 0 rijen = al geclaimd

-- hoogstens één gepubliceerde run per project (nu alleen door de RPC afgedwongen)
create unique index on model_results (project_id) where is_published;

-- hoogstens één approved datasetversie per project
create unique index on dataset_versions (project_id) where approved_at is not null;

-- queue-poll
create index on model_runs (state, created_at) where state in ('QUEUED');
create index on model_runs (heartbeat_at) where state not in ('COMPLETED','FAILED','CANCELLED');

-- kostenbewaking
create index on ai_interactions (project_id, created_at desc);
```

### 5.3 RLS

Alle policies worden herschreven op `org_id` in plaats van `is_builder()`:

```sql
-- lidmaatschapscheck, SECURITY DEFINER, search_path = ''
mmm.has_org_access(p_org uuid, p_min_role text) returns boolean

-- voorbeeld
create policy projects_member_read on mmm.projects for select to authenticated
  using (mmm.has_org_access(org_id, 'client'));
create policy projects_builder_write on mmm.projects for all to authenticated
  using (mmm.has_org_access(org_id, 'builder')) with check (mmm.has_org_access(org_id, 'builder'));
```

Storage krijgt path-gebonden policies: `bucket_id = 'mmm-raw-data' and (storage.foldername(name))[1] = <een project van mijn org>` — vandaag is elk pad in de bucket leesbaar voor elke builder.

---

## 6. Model-lifecycle

### 6.1 State machine

```
                    ┌──────────┐
                    │  QUEUED  │◄── enige toestand die de API mag aanmaken
                    └────┬─────┘
        claim (CAS)      │
                    ┌────▼───────────┐
                    │  VALIDATING    │  config + dataset-hash herbevestigen
                    └────┬───────────┘
                    ┌────▼───────────┐
                    │ PREPARING_DATA │  master downloaden, contract verifiëren
                    └────┬───────────┘
                    ┌────▼───────────┐
                    │ BUILDING_MODEL │  PyMC-graaf bouwen, prior-predictive hercontrole
                    └────┬───────────┘
                    ┌────▼───────────┐
                    │   SAMPLING     │  NUTS  (heartbeat elke 30 s)
                    └────┬───────────┘
                    ┌────▼───────────┐
                    │VALIDATING_MODEL│  diagnostics + identifiability + holdout + placebo
                    └────┬───────────┘
                    ┌────▼─────────────┐
                    │CALCULATING_RESULTS│ attributie, curves, allocatie (indien toegestaan)
                    └────┬─────────────┘
                    ┌────▼───────────┐
                    │  COMPLETED     │
                    └────────────────┘

  elke toestand ──► FAILED (met error_code + gebruikerstekst + technische tekst)
  QUEUED/…/SAMPLING ──► CANCELLED (expliciet door de gebruiker)
  heartbeat verlopen ──► QUEUED (retry, attempt+1) of FAILED (attempt = max)
```

**Regels:**

- Alleen de worker mag een toestand voorbij `QUEUED` zetten, en alleen via een
  compare-and-set op de vorige toestand. Een `UPDATE` die 0 rijen raakt is een
  geclaimde/verouderde job → de worker stopt zonder iets te schrijven.
- De toestand staat in een *kolom met een enum-type*, niet in een `text` met check-constraint
  die bij elke uitbreiding gemigreerd moet worden.
- Elke toestand heeft een verwachte maximale duur; de reaper gebruikt die (niet één globale
  30 minuten) — zie W5.
- `error_code` is een gesloten enum (`DATA_QUALITY`, `CONFIG_INVALID`, `PRIOR_GATE_FAILED`,
  `SAMPLING_DIVERGED`, `TIMEOUT`, `OOM`, `STORAGE_UNAVAILABLE`, `INTERNAL`). De gebruiker
  ziet altijd `error_user_message` (vaste, vertaalde tekst per code); `error_technical` is
  alleen zichtbaar voor de builder-rol.

### 6.2 Retry-beleid

| error_code | Retry? |
|---|---|
| `STORAGE_UNAVAILABLE`, `TIMEOUT`, `OOM`, container-verlies | Ja, exponentieel, max 2 pogingen |
| `SAMPLING_DIVERGED` | Nee — een tweede identieke fit divergeert weer. Dit is een configuratieprobleem. |
| `CONFIG_INVALID`, `PRIOR_GATE_FAILED`, `DATA_QUALITY` | Nee — permanent, vereist gebruikersactie |
| `INTERNAL` | Eén keer, daarna handmatig |

---

## 7. Worker-architectuur

### 7.1 Wat blijft

`ports.py` + injecteerbare fit is een goede keuze en blijft. De worker blijft
Supabase-/Modal-vrij in zijn kern.

### 7.2 Wat verandert

1. **Claim-and-lease** in plaats van `mark_running`:
   `claim_run(run_id, worker_id) -> bool` doet de CAS uit §6.1. `poll_queue` spawnt alleen
   wat het zelf geclaimd heeft.
2. **Heartbeat** elke 30 s tijdens `SAMPLING`; de reaper kijkt naar `heartbeat_at`, niet naar
   `started_at`, en gebruikt een per-toestand-timeout.
3. **Aparte Modal-functies per jobtype.** `prepare` is seconden en heeft 1 CPU nodig; een
   fit is minuten met 4 CPU's. Nu delen ze één functie met één timeout en één containerpool
   — daardoor blokkeert een prepare een fit-slot en omgekeerd (A4/W5). Splitsen naar
   `run_prepare_fn` (timeout 5 min, cpu 1) en `run_fit_fn` (timeout 45 min, cpu 4).
4. **`enqueue` beveiligen** met een gedeeld geheim (`Modal Secret` + `Authorization`-header
   vanuit de Next-route) en het aanroepcontract corrigeren (Pydantic-body i.p.v. een
   scalaire parameter, zodat C5 verdwijnt).
5. **Gestructureerde logging**: één JSON-regel per toestandsovergang met `run_id`,
   `project_id`, `state`, `duration_ms`, en bij falen `error_code`. Naar stdout (Modal-logs)
   én naar `model_runs.log_tail` (laatste ~50 regels) zodat een builder ze in de app ziet.
6. **Geen silent-fail meer** op de trace-upload (W3): mislukt de upload, dan gaat de run naar
   `COMPLETED` met `inference_data_path = null` **en** een expliciete
   `warning: 'trace_not_stored'` in de diagnostics, zodat "niet heranalyseerbaar" zichtbaar
   is.
7. **`_run_extra_evaluations` mag niet meer stil falen** (W4): een mislukte
   CV/placebo-check wordt een `warning` in de diagnostics, niet een stilte.
8. **`pymc-marketing` verwijderen** uit de dependencies (W6).

### 7.3 Idempotency in de praktijk

```
API:    idempotency_key = sha256(spec_sha256 ‖ master_sha256 ‖ canonical(sample) ‖ seed)
        INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
        → geen id terug = deze exacte run bestaat al → geef de bestaande terug
Worker: claim via CAS; 0 rijen = iemand anders heeft 'm → return zonder side effects
```

Daarmee zijn zowel een dubbele UI-klik als een dubbele `poll_queue`-spawn structureel
onschadelijk.

---

## 8. AI-architectuur

### 8.1 De grens, expliciet

**AI MAG:**

| Taak | Hoe begrensd |
|---|---|
| Kolomsemantiek **voorstellen** | Voorstel gaat door een deterministische validator (§4, stap 3); een voorstel dat de validator afkeurt bereikt de gebruiker als vraag, niet als feit |
| Data-anomalieën **signaleren** | Alleen als gestructureerde `InspectionFinding`; geen invloed op de config |
| Zakelijke context **eliciteren en vastleggen** | Getypeerde `BusinessContextNote`; per feit een `source: user_stated \| ai_inferred` |
| Model-**intent** voorstellen | Zie §8.2 — een gesloten, ordinale vocabulaire, geen getallen |
| Resultaten **uitleggen** | Krijgt alleen de gefilterde `model_results` + `model_validations`; mag het validatieniveau niet tegenspreken |
| Een klantsamenvatting **schrijven** | Alleen als `level ≥ USABLE_FOR_DECISIONS`; anders weigert de route |
| Diagnosticeren waarom een fit faalde | Mag een *voorstel* doen; de gebruiker bevestigt |

**AI MAG NIET:**

| Verboden | Vervangen door |
|---|---|
| Priors als getallen zetten | `PriorBuilder` (deterministisch) vertaalt intent + datastatistieken → priors |
| Een ROAS-kalibratie invullen | Alleen een expliciet formulier waarin de gebruiker het experiment vastlegt (type, periode, gemeten lift, betrouwbaarheid), met een verplichte bevestiging |
| Een fit starten | Elke fit vereist een menselijke bevestiging; `/api/fit-refine` wordt "stel een verbetering voor", niet "start een verbetering" |
| Sampling-parameters kiezen | Vaste, geteste waarden; alleen de builder-rol mag afwijken |
| Een `fail`/`uncertain` model aanbevelen | De route weigert; de UI toont het deterministische oordeel bóven de AI-tekst |
| Kolomrollen definitief vaststellen | De validator beslist; bij twijfel beslist de gebruiker |
| Vrije `storage_path` opgeven | De server leidt het pad af uit `dataset_version_id` |

### 8.2 Van intent naar priors

Dit is de kern van de AI-herstructurering. De tool `propose_model_config` wordt vervangen
door `propose_model_intent` met een **gesloten, ordinale** vocabulaire:

```jsonc
{
  "kpi_type": "revenue" | "orders" | "leads" | "sessions",     // bepaalt de likelihood
  "channels": [{
    "name": "tv_spend",
    "unit": "currency" | "impressions" | "grp" | "sendings" | "clicks",
    "role": "brand_building" | "demand_capture" | "mixed",     // → adstock-vorm + half-life
    "expected_carryover": "none" | "short" | "medium" | "long",// → half-life prior-centrum
    "expected_strength": "small" | "moderate" | "large" | "unknown", // → beta-schaal
    "saturation_belief": "far_from_saturated" | "approaching" | "likely_saturated" | "unknown"
  }],
  "seasonality": "none" | "mild" | "strong" | "unknown",
  "known_events": [{ "name": "...", "weeks": [[2024, 48]] }],
  "reasoning": "…"
}
```

`PriorBuilder` (nieuw, in `mmm_core.model.priors`, volledig getest) vertaalt dat samen met de
**datastatistieken** naar een `ModelConfig`:

```python
def build_priors(intent: ModelIntent, stats: DatasetStatistics) -> ModelConfig:
    # 1. Baseline/media-budget — lost S1 op.
    #    De intercept wordt gecentreerd op (1 - verwacht media-aandeel) × mediaan(KPI),
    #    niet op de hele mediaan. Het totale media-budget wordt over de kanalen verdeeld,
    #    zodat beta_sigma MEESCHAALT met het aantal kanalen:
    #        media_share_prior ~ Beta(a, b)  met centrum 0.30, sd 0.15
    #        beta_sigma_c = k * media_share_center / n_channels   (k uit strength)
    #    Zo blijft E[som contributies] ≈ 0.30 ongeacht 1 of 12 kanalen.
    #
    # 2. Saturatie — lost S2 op.
    #    half_saturation wordt gemodelleerd op een LogNormal rond de mediane weekspend,
    #    NIET op Beta(0,1) × max spend, zodat "nog ver van verzadigd" (halfsat > max spend)
    #    representeerbaar is. `saturation_belief` verschuift het centrum.
    #
    # 3. Seizoen — lost S3 op.
    #    season_sigma wordt afgeleid uit de WERKELIJKE seizoensamplitude in de data
    #    (STL/Fourier-decompositie van de KPI), met `seasonality` als multiplier.
    #
    # 4. Elke afgeleide prior krijgt een `provenance`-veld:
    #    {"param": "beta_tv", "from": "intent.expected_strength=large + n_channels=6"}
```

Voordelen: de AI kan het model **niet** kapotmaken met een verkeerd getal; elke prior is
herleidbaar; de intent is uitlegbaar aan een marketeer ("je zei dat TV lang doorwerkt en
sterk is; daarom verwacht het model …"); en de vertaling is unit-testbaar los van elke
LLM-call.

### 8.3 Validatie van AI-output

Alle AI-output loopt door één pad:

```
tool_use → zod-achtige schemavalidatie (TS) → domeinvalidatie (bereiken, verwijzingen)
         → bij fout: geen stille drop (AI9), maar een expliciete, zichtbare afwijzing
         → gevalideerde intent → PriorBuilder → ModelConfiguration → §4 stap 6
```

### 8.4 Prompt-injectie

- Datasetinhoud (kolomnamen, preview) wordt **altijd** in een gemarkeerd, als-data
  aangeduid blok gezet, met een expliciete instructie dat inhoud daarbinnen nooit als
  opdracht geldt.
- Kolomnamen worden genormaliseerd (lengte, karakterset) vóór ze in een prompt gaan.
- De classificatie-output wordt hoe dan ook door de deterministische validator gehaald, dus
  een geslaagde injectie kan hooguit een *voorstel* beïnvloeden, nooit de uitkomst.

### 8.5 Kosten

- `ai_interactions` legt tokens en geschatte kosten per interactie vast.
- Chatgeschiedenis wordt afgekapt: laatste N beurten volledig + een door de app geschreven,
  deterministische samenvatting van de projecttoestand (die er al is: `formatFitContextBlock`
  etc.). Lost C6 op.
- Harde caps per project per dag; overschrijding = een nette melding, geen 500.

---

## 9. MMM-methodologie (doel)

### 9.1 Target / KPI

| Aspect | Doel |
|---|---|
| KPI-type | Expliciet vastgelegd (`revenue` / `orders` / `leads` / `sessions`) — bepaalt de likelihood deterministisch, niet de AI (S11) |
| Likelihood | `revenue` → Normal of Student-T (op basis van gemeten kurtosis van de residuen van een snelle OLS-voorloop); `orders`/`leads` met mediaan < 50 → Negative Binomial; anders Normal |
| Transformatie | Additieve link houdt de decompositie exact — dat blijft. Geen log-transformatie van de KPI zelf (dat maakt de decompositie multiplicatief zonder de voordelen van de count-link) |
| Aannames | Expliciet in `model_configurations.resolved_spec.assumptions[]`, en in gewone taal getoond in de UI |

### 9.2 Media-variabelen

- **Eenheid is verplicht** (`currency` / `impressions` / `grp` / `sendings` / `clicks`).
  Alleen `currency`-kanalen doen mee aan budgetoptimalisatie en ROAS; voor de rest wordt de
  metriek "KPI per 1.000 eenheden" genoemd, en het optimalisatietabblad toont ze als *vast
  gegeven*, niet als verdeelbaar budget. Lost S4 op.
- Negatieve spend blokkeert (nu alleen een waarschuwing).
- Variatie-ondergrens: een kanaal met een coëfficiënt van variatie onder een drempel, of met
  minder dan N actieve weken, wordt geweigerd als apart kanaal met een uitleg ("dit kanaal
  heeft te weinig variatie om zijn effect van de baseline te kunnen scheiden"). Lost S10 op.

### 9.3 Adstock

- Geometric en delayed blijven, genormaliseerd (correct).
- **Burn-in expliciet** (S5): de eerste `l_max - 1` weken worden ofwel uit de likelihood
  gelaten (geen bijdrage aan `y`, wel aan de adstock-stock voor latere weken), ofwel — als de
  gebruiker pre-window-data heeft — als warm-up meegegeven. De keuze wordt vastgelegd en
  getoond ("de eerste 11 weken zijn gebruikt om de na-ijl op te bouwen en tellen niet mee in
  de schatting").
- `l_max` wordt begrensd op `min(l_max, n_weeks // 4)` met een waarschuwing.
- Half-life-prior blijft `Beta` op `alpha`, met een centrum uit `expected_carryover`.

### 9.4 Saturatie

- Hill blijft, maar `half_saturation` verhuist naar **LogNormal rond de mediane weekspend**
  in plaats van `Beta(2,2)` × max spend (S2), zodat "nog niet verzadigd" representeerbaar is.
- De slope-prior blijft `Gamma`, maar met een centrum op 1,0 (concave vanaf de oorsprong) —
  een S-curve moet de data expliciet afdwingen, want een S-curve op weinig data is de
  klassieke bron van absurde mROAS.
- **Identificeerbaarheidscontrole:** `beta` en `half_saturation` zijn zwak geïdentificeerd
  als de spend-range smal is. Er komt een expliciete check op de posterior-correlatie tussen
  `beta_c` en `halfsat_c`; boven een drempel wordt het verzadigingspunt niet gerapporteerd.

### 9.5 Priors

- Het budgetprincipe uit §8.2 (`media_share` + verdeling over kanalen) is de kern.
- **Elke prior krijgt een herkomst** (`provenance`) en is opvraagbaar in de UI.
- **Prior-predictive check is een poort**, geen rapportje (S9): media-aandeel in
  `[5%, 80%]`, `admits_observed`, prior-bereik ≤ 20× het waargenomen bereik.
- **Prior-sensitiviteit**: bij de eindvalidatie draait één extra fit met alle priors 2× zo
  breed. Verandert het contributie-aandeel van een kanaal met meer dan een drempel, dan is
  dat kanaal *prior-gedreven* en wordt dat als zodanig gerapporteerd. Dit is het eerlijkste
  antwoord op "hoeveel hiervan is data en hoeveel is aanname?".

### 9.6 Controls

- Trend (linear/piecewise) en Fourier-seizoen blijven.
- `season_sigma` wordt uit de data gekalibreerd (S3).
- Kalenderdummy's (`nlCalendar.ts` bestaat al) worden **standaard voorgesteld** voor Black
  Friday/kerst wanneer de KPI daar een aantoonbare piek heeft — nu is dat volledig aan de AI
  overgelaten.
- Controls worden gestandaardiseerd (gebeurt al) en krijgen een collineariteitscheck tegen
  de mediakanalen: een control die sterk met een kanaal correleert steelt het effect.

### 9.7 Multicollineariteit en identificeerbaarheid

Dit is het grootste inhoudelijke gat en krijgt een eigen module (`mmm_core.model.identify`):

| Check | Wat het meet | Gevolg |
|---|---|---|
| VIF over de predictoren | groepscollineariteit | blokkerend boven een drempel, waarschuwend eronder (bestaat al in de ingestie, wordt doorgetrokken naar het resultaat — S7) |
| Posterior-correlatie tussen `beta_c` | of het model twee kanalen kan scheiden | `\|r\| > 0,7` → beide kanalen als "niet afzonderlijk vast te stellen" markeren en hun *gecombineerde* effect rapporteren |
| Prior/posterior-overlap per parameter | of de data iets heeft toegevoegd | overlap > 0,9 → "dit cijfer komt uit je aanname, niet uit je data" |
| Relatieve intervalbreedte per kanaal | bruikbaarheid van de schatting | breedte > drempel → geen puntschatting tonen |
| Prior-sensitiviteit (§9.5) | robuustheid | verschuiving > drempel → als prior-gedreven markeren |

### 9.8 Diagnostiek

Verplicht bij elke run (nu deels opt-in of afwezig):

- **Convergentie**: R-hat (per parameter, niet alleen max), ESS bulk *en* tail, divergenties,
  E-BFMI, tree-depth-saturatie.
- **Posterior predictive checks**: dekking van meerdere niveaus (50/80/94%), niet alleen 94%;
  PIT-histogram; residu-autocorrelatie (Durbin-Watson/Ljung-Box) — bij tijdreeksen is
  autocorrelatie in de residuen hét signaal dat er structuur mist.
- **Out-of-sample**: altijd minimaal één holdout van de laatste ~12 weken (goedkoop, één
  extra fit), en time-series-CV wanneer de dataset lang genoeg is. Niet meer opt-in (S8).
- **Placebo**: altijd (S8).
- **Prior-predictive**: al vóór de fit, als poort.
- **Prior-sensitiviteit**: één extra fit met verbrede priors.

Kosten: 1 hoofdfit + 1 holdout + 1 placebo + 1 prior-sensitiviteit ≈ 2,5× de huidige
fitkosten met de lichtere sampling-budgetten die er al zijn (`draws=500, chains=2`). Dat is
de prijs van een uitspraak die je durft te publiceren.

### 9.9 Reproduceerbaarheid

Vastgelegd op `model_runs`: `seed` (expliciet, niet impliciet 0), `sample_params`,
`spec_sha256`, `master_sha256`, `mmm_core_version`, `package_versions`
(pymc/numpyro/arviz/pytensor/numpy), `worker_image_digest`, `engine_version`.

Daarnaast een `reproduce`-commando (worker-functie) dat uit een `model_run_id` de exacte
inputs opnieuw ophaalt en de fit herhaalt, met een assert op de resulterende
contributie-aandelen. Dat is de enige manier om reproduceerbaarheid te *bewijzen* in plaats
van te beloven.

---

## 10. Implementatiefasen

> Volgorde is bewust: eerst de correctheidsbugs die stil resultaten vernietigen (fase 1),
> dan de statistische kern (fase 2–3), dan de betrouwbaarheidslaag (4–5), dan pas
> architectuur/product (6–9). Zo is de app na élke fase beter, niet pas aan het eind.

### Fase 1 — Stop de bloeding (P0-bugs, geen architectuurwijziging)

**Doel:** geen enkel resultaat mag meer stil verloren gaan of stil verkeerd zijn.

| Werk | Bestanden |
|---|---|
| `NaN` → `null` in de hele resultaat-JSON; `mape` met `np.nanmean`; `roas` `None` bij 0 spend; een `_json_safe()`-laag in `to_json_dict()` die elke niet-eindige float naar `null` mapt | `packages/mmm-core/src/mmm_core/model/fit.py` |
| Idempotency: `idempotency_key` + CAS-claim (kan als kleine migratie vóór het volledige datamodel) | `supabase/migrations/00xx_*.sql`, `worker/mmm_worker/supabase_backends.py`, `runner.py`, `modal_app.py` |
| `/api/fit-refine` → alleen een *voorstel*; de rondeteller uit de DB, niet uit de body | `app/api/fit-refine/route.ts`, `lib/wizard/turns/review.ts` |
| Priors-whitelist met harde bereiken in `jobspec.py` (tussenoplossing tot fase 3) | `worker/mmm_worker/jobspec.py` |
| `calibration` alleen accepteren met een `experiment`-blok dat door de gebruiker is bevestigd | `jobspec.py`, `lib/anthropic/architect.ts`, nieuwe route |
| `enqueue`-contract fixen (body i.p.v. query) + gedeeld geheim | `modal_app.py`, `lib/jobs.ts` |
| Inspectie-timeout-reaper + "opnieuw proberen"-uitweg | `app/api/inspect/route.ts`, `lib/wizard/turns/inspect.ts`, migratie |
| Chathistorie afkappen + `GET /api/chat` daadwerkelijk gebruiken | `app/api/chat/route.ts`, `components/wizard/ChatWizard.tsx` |
| Publicatiepoort: `publish_run()` weigert bij `verdict='fail'` | `supabase/migrations/00xx_publish_gate.sql` |

**Afhankelijkheden:** geen. **Risico's:** laag; alles is lokaal. **Tests:** unit-tests voor
`_json_safe` (NaN/inf/None), een regressietest met een KPI-week op 0 en een kanaal met 0
spend; een workertest die een dubbele `run_job`-aanroep doet en één `model_run` verwacht.

### Fase 2 — De statistische kern herzien (het hart)

**Doel:** de priors kloppen, en dat is aantoonbaar.

| Werk | Bestanden |
|---|---|
| Nieuwe module `mmm_core.model.priors`: `ModelIntent`, `DatasetStatistics`, `build_priors()` met het media-budgetprincipe (§8.2/§9.5) | nieuw |
| `half_saturation` → LogNormal rond de mediane weekspend (S2) | `model/build.py`, `model/config.py`, `optimize.py`, `model/predict.py` |
| `season_sigma` uit de data kalibreren (S3) | `mmm_core/features.py` (amplitudeschatting), `priors.py` |
| Adstock-burn-in expliciet (S5) | `model/build.py`, `model/fit.py`, `model/predict.py` |
| Kanaalvariatie- en eenheidsvalidatie in `build_model` (S10, S4) | `model/build.py`, `model/config.py` (`ChannelConfig.unit`) |
| Likelihood deterministisch uit `kpi_type` (S11) | `priors.py` |
| `_HILL_EPS` naar één plek + een test die numpy/PyTensor/optimize gelijk pint (S14) | `transforms/saturation.py` + tests |

**Afhankelijkheden:** fase 1 (voor de JSON-veiligheid). **Risico's:** hoog — dit verandert
elk resultaat. Mitigatie: de bestaande ground-truth-simulator (`model/simulate.py` +
`tests/test_fit_recovery.py`) wordt uitgebreid tot een **recovery-matrix**: 1/3/5/8 kanalen ×
{sterk seizoen, zwakke seizoen} × {ver van verzadigd, verzadigd} × {gecorreleerde kanalen,
onafhankelijk}. Elke cel moet de ware contributie-aandelen binnen een tolerantie terugvinden.
Dat is de enige manier om te *bewijzen* dat de nieuwe priors beter zijn dan de oude — en om
de oude te diskwalificeren.

**Tests:** prior-predictive-schaaltest (het media-aandeel onder de prior blijft binnen
`[0,05; 0,80]` voor 1..12 kanalen); parameter-recovery-matrix; een test die aantoont dat een
niet-verzadigd kanaal als niet-verzadigd wordt teruggevonden (faalt vandaag gegarandeerd).

### Fase 3 — Modelconfiguratie: intent in plaats van getallen

| Werk | Bestanden |
|---|---|
| `propose_model_config` → `propose_model_intent` (gesloten vocabulaire, §8.2) | `lib/anthropic/architect.ts` |
| Server-side intent-validatie + `PriorBuilder`-aanroep + `model_configurations`-rij | nieuwe route `app/api/model-configurations/route.ts` |
| `storage_path` niet meer uit de config: server leidt af uit `dataset_version_id` (A2) | route + `jobspec.py` |
| Configuratievalidatie vóór de queue (A3) | nieuwe `lib/modelConfig/validate.ts` + Python-tegenhanger |
| Prior-predictive als **blokkerende** poort (S9) | `worker/mmm_worker/prior_predictive.py`, jobs-route, wizard |
| UI: de afgeleide priors met herkomst tonen (U5) | nieuw component |

**Risico's:** de architect-prompt moet grondig herschreven; reken op meerdere iteraties.
**Tests:** intent → config golden-file-tests; een test dat élk pad naar een fit door de
prior-poort gaat.

### Fase 4 — Diagnostiek en identificeerbaarheid

| Werk | Bestanden |
|---|---|
| Nieuwe module `mmm_core.model.identify` (§9.7) | nieuw |
| Uitgebreide diagnostiek (§9.8): ESS-tail, E-BFMI, multi-niveau-dekking, PIT, residu-autocorrelatie | `model/fit.py` |
| Holdout + placebo + prior-sensitiviteit **altijd** (S8) | `worker/mmm_worker/runner.py`, `evaluation.py` |
| `model_diagnostics` als eigen entiteit wegschrijven | migratie + `supabase_backends.py` |

**Risico's:** de fitkosten stijgen ~2,5×. Mitigatie: lichtere sampling voor de extra fits
(bestaat al) en de nieuwe per-jobtype-containerconfiguratie uit fase 6.

### Fase 5 — Modelvalidatielaag (de vier niveaus)

| Werk | Bestanden |
|---|---|
| `mmm_core.model.validate_run()` → `ModelValidation` met 4 niveaus, per-kanaal-oordeel, `allowed_outputs`, `ruleset_version` | nieuw |
| Resultaatfiltering: geen budgetadvies bij niet-`USABLE`; geen per-kanaal-ROAS voor een niet-identificeerbaar kanaal | `model/fit.py`, `optimize.py` |
| `model_validations`-entiteit + publicatiepoort erop | migratie, `publish_run()` |
| UI: het oordeel bóven de resultaten, met redenen in gewone taal en een concrete vervolgactie per reden | `SummaryView`, dashboard |
| **Score-ontwerp**: geen enkel getal. Een niveau + een lijst redenen + per kanaal een eigen oordeel. Als er een score komt, dan alleen als samenvatting *naast* de redenen, nooit in plaats daarvan | idem |

### Fase 6 — Worker, state machine en jobinfrastructuur

Zie §6 en §7. Aparte Modal-functies per jobtype, heartbeat, per-toestand-timeouts,
retry-beleid, gestructureerde logging, `cancelled` daadwerkelijk implementeren.

### Fase 7 — Datamodel en migratie

Zie §5 en §11. `dataset_versions`, `model_configurations`, `model_runs`,
`model_diagnostics`, `model_validations`, `model_results`, `organizations` + `memberships`,
nieuwe RLS, storage-path-policies.

### Fase 8 — Data-ingestie herzien (stap 1 van het product)

| Werk |
|---|
| Upload server-side (signed URL, door de server bepaald pad), één transactie, hash + dedupe (D4) |
| Encoding-detectie (chardet-achtig) + `decimal=","`-ondersteuning, zowel browser als worker (D5) |
| Geschiktheidsvalidatie als eigen, expliciete stap met een `DatasetSuitabilityReport` en een gebruikersvriendelijke vertaling per code (de registry in `lib/qualityIssueRegistry.ts` is hiervoor de basis en is al goed) |
| Deterministische kolomvalidatie vóór de AI-classificatie (D3): type, cardinaliteit, monotoniciteit (ID-detectie), niet-negativiteit, variatie |
| Datasetversie-immutability + "je data is veranderd"-signaal op bestaande runs (A9, D2) |
| Multi-bron weer echt ondersteunen of expliciet uitzetten (A8) |

### Fase 9 — AI-orkestratie afronden

Intent-tools, injectie-afscherming, kostenbewaking, `ai_interactions`,
`client_summary`-poort, `/api/fit-refine` als voorstel-generator.

### Fase 10 — Opruimen, testen, eindvalidatie

Dode code weg (A10, T3), documentatie consolideren tot één `docs/`-map, eslint toevoegen aan
CI, frontend-tests voor de kritieke flows, en de volledige DoD uit §13 aflopen.

---

## 11. Migratiestrategie

De applicatie is in gebruik (er zijn projecten, datasets en runs). De migratie is daarom
**additief en in twee stappen per entiteit**, nooit een big-bang.

### 11.1 Volgorde

1. **Fase 1 vereist geen datamigratie** — alleen kolommen toevoegen (`idempotency_key`,
   `claimed_by`, `heartbeat_at`) en gedrag corrigeren. Bestaande runs blijven leesbaar.
2. **Nieuwe entiteiten worden náást de oude gemaakt** (`dataset_versions` naast `datasets`,
   `model_runs_v2` naast `jobs`+`model_runs`), met een backfill-script dat de bestaande rijen
   overzet:
   - `datasets` → `dataset_versions` (`version_no` op volgorde van `created_at`;
     `master_sha256` berekend uit de bestaande Storage-objecten).
   - `jobs.config` + `model_runs` → `model_configurations` + `model_runs_v2` +
     `model_results`. Voor oude runs blijven `model_diagnostics`/`model_validations` leeg,
     met `ruleset_version = 'legacy'`.
3. **Leeslaag eerst omzetten, dan de schrijflaag.** De UI leest een week lang uit de nieuwe
   tabellen (die door een trigger/backfill in sync zijn) vóór de schrijfpaden omgaan. Zo is
   terugrollen een configuratieomschakeling, niet een datamigratie.
4. **De oude tabellen worden pas gedropt** als de nieuwe een volledige cyclus in productie
   hebben gedraaid.

### 11.2 Omgaan met bestaande resultaten

Dit is de lastigste beslissing (zie §14, beslissing 1): de resultaten van bestaande runs zijn
met de oude priors berekend en dus, volgens deze audit, systematisch scheef.

Voorstel: bestaande runs krijgen `ruleset_version = 'legacy'` en worden in de UI gemarkeerd
als *"berekend met een oudere modelversie — niet vergelijkbaar met nieuwe berekeningen"*.
Gepubliceerde legacy-runs blijven zichtbaar maar tonen die markering ook op het
klantdashboard. Ze worden **niet** automatisch opnieuw gefit (dat zou stilzwijgend de cijfers
onder een klant vandaan veranderen); de builder krijgt een expliciete "opnieuw berekenen met
de nieuwe modelversie"-actie.

### 11.3 Terugrolbaarheid

- Elke migratie is additief (`add column if not exists`, nieuwe tabellen) — geen `drop` vóór
  fase 10.
- De worker leest tijdens de overgang beide vormen (feature-flag op `engine_version`).
- Fase 2 (de priors) krijgt een `prior_ruleset` op de configuratie, zodat een oude fit
  letterlijk reproduceerbaar blijft met de oude priors.

---

## 12. Teststrategie

### 12.1 Wat er nu is

`pytest packages/mmm-core worker/tests` → **291 passed, 3 skipped**;
`pytest packages/mmm-core -m slow` → **16 passed** (3 m 48 s). De ingestie- en
transformatielaag is behoorlijk gedekt (dates, quality, pipeline, features, adstock,
saturation, optimize, evaluation, jobspec, runner, prepare, contract-fixture). De `-m
slow`-suite draait een echte NUTS-fit tegen de ground-truth-simulator. Frontend: nul tests.

De suite is groen en dat betekent iets — maar niet dat het model klopt. Wat *niet* wordt
getoetst: priors op schaal (S1), verzadiging buiten het waargenomen bereik (S2),
seizoensconfounding (S3), eenheden (S4), burn-in (S5), identificeerbaarheid (S6), een KPI
met een nul-week (C1), een dubbele job-spawn (C2), en het volledige frontend-oppervlak.
Elke P0 in dit document valt in dat gat — de tests zijn niet fout, ze staan alleen op de
verkeerde plek.

### 12.2 Wat erbij moet, per fase

| Fase | Verplichte tests vóór "klaar" |
|---|---|
| 1 | `_json_safe` op NaN/±inf/None; end-to-end workertest met een KPI-week 0 én een 0-spend-kanaal die een geldige `model_run` oplevert; dubbele-spawn-test die één run oplevert; `fit-refine` kan de rondelimiet niet omzeilen |
| 2 | **Prior-predictive-schaaltest**: media-aandeel onder de prior binnen `[0,05; 0,80]` voor 1..12 kanalen (faalt vandaag). **Recovery-matrix** (§ fase 2). **Niet-verzadigd kanaal wordt als niet-verzadigd teruggevonden** (faalt vandaag). Burn-in: de eerste weken beïnvloeden de schatting niet meer. numpy/PyTensor/optimize-saturatie identiek. |
| 3 | Intent → config golden files; elke intent-permutatie levert een config die door `ModelConfig.__post_init__` komt; geen enkel pad naar een fit omzeilt de prior-poort; `storage_path` kan niet van buiten worden gezet |
| 4 | Identifiability: twee kunstmatig identieke kanalen worden als niet-scheidbaar gemarkeerd; een kanaal waarvan de posterior gelijk is aan de prior wordt als prior-gedreven gemarkeerd; holdout/placebo/prior-sensitiviteit draaien altijd |
| 5 | Validatieniveau-tabel: voor elke combinatie van diagnostics het verwachte niveau; `allowed_outputs` sluit budgetadvies uit bij niet-`USABLE`; `publish_run()` weigert een niet-`USABLE` run |
| 6 | State-machine-transitietabel (elke ongeldige overgang wordt geweigerd); heartbeat-reaper; retry-beleid per `error_code`; annuleren werkt |
| 7 | RLS-tests: gebruiker uit org A kan geen enkele rij van org B lezen/schrijven, per tabel; storage-path-policy |
| 8 | Edge-case-suite op de ingestie: extreem lage spend, nul spend, sterk gecorreleerde kanalen, 20 weken data, sterk seizoen, kanaal zonder variatie, spendverschillen van 1000×, ontbrekende weken, outliers, Latin-1-encoding, `1.234,56`-notatie, dubbele datums, maandcadans |
| 9 | Prompt-injectie-fixtures (kolomnaam met instructie) veranderen de uiteindelijke config niet; AI-output die het schema schendt wordt zichtbaar afgewezen |
| 10 | Frontend: de zeven wizardfasen (Playwright), typecheck, eslint, volledige Python-suite incl. `slow` |

### 12.3 Testinfrastructuur

- **Golden datasets**: naast de bestaande synthetische simulator drie "moeilijke" datasets
  vastleggen (sterk seizoen + gecorreleerde kanalen; korte reeks; count-KPI met nul-weken).
  Deze worden de regressiebasis voor élke wijziging aan de kern.
- **Frontend-tests** met Playwright tegen een lokale Supabase (`supabase start`) — nu bestaat
  er geen enkele.
- **CI uitbreiden**: eslint toevoegen, RLS-tests als aparte job, de recovery-matrix als
  nightly (te traag voor elke push).

---

## 13. Definition of Done

De refactor is klaar wanneer **alle** onderstaande punten aantoonbaar waar zijn:

**Statistiek**
1. De prior-predictive-schaaltest slaagt voor 1..12 kanalen.
2. De parameter-recovery-matrix slaagt in elke cel binnen de vastgelegde tolerantie.
3. Een niet-verzadigd kanaal wordt als niet-verzadigd teruggevonden.
4. Adstock-burn-in is expliciet en getest.
5. Elke prior heeft een `provenance` die in de UI opvraagbaar is.
6. Prior-sensitiviteit draait bij elke run en het resultaat is zichtbaar.

**Validatie**
7. Elke run heeft een `ModelValidation` met een van de vier niveaus en expliciete redenen.
8. Per kanaal is er een eigen oordeel; een niet-identificeerbaar kanaal krijgt géén
   puntschatting.
9. Budgetadvies verschijnt uitsluitend bij `USABLE_FOR_DECISIONS`.
10. `publish_run()` weigert een run die niet minimaal `USABLE_FOR_DECISIONS` is.
11. Het klantdashboard toont het oordeel bovenaan, in gewone taal.

**Reproduceerbaarheid**
12. Uit een `model_run_id` kan de run worden herhaald met identieke contributie-aandelen
    (geautomatiseerde `reproduce`-test).
13. Dataset-hash, config-hash, seed, package-versies en image-digest staan op elke run.

**Infrastructuur**
14. Een dubbele enqueue/spawn levert nooit een tweede run op (getest).
15. Elke toestandsovergang gaat via compare-and-set; ongeldige overgangen worden geweigerd.
16. Een gecrashte container laat nooit een run permanent in een tussentoestand achter.
17. Annuleren werkt.

**Data**
18. Elke `NaN`/`inf` in de resultaat-JSON is `null`; de edge-case-suite bewijst het.
19. Kolomrollen worden deterministisch gevalideerd; een ID-kolom kan geen kanaal worden.
20. Een nieuwe upload markeert bestaande runs zichtbaar als "hoort bij oudere data".

**Security**
21. RLS-tests bewijzen dat een gebruiker uit org A niets van org B kan zien of schrijven, per
    tabel en in Storage.
22. `storage_path` kan niet van buiten worden bepaald.
23. De Modal-`enqueue` is geauthenticeerd.

**AI**
24. Geen enkel pad laat vrije LLM-output een prior, een kalibratie of een sampling-parameter
    bepalen.
25. Prompt-injectie-fixtures veranderen de uiteindelijke configuratie niet.
26. Er is een kostenplafond per project per dag.

**Product**
27. Elke blokkerende melding heeft een gebruikerstekst én een concrete vervolgactie.
28. Er is geen enkele toestand waarin de gebruiker een spinner ziet zonder uitweg.
29. `npm run typecheck`, `npm run lint`, `npm run build`, `pytest` (incl. `slow`) en de
    Playwright-suite zijn groen in CI.

---

## 14. Open vragen / beslissingen voor de product owner

| # | Beslissing | Waarom het jouw keuze is | Mijn advies |
|---|---|---|---|
| **1** | **Wat doen we met bestaande, gepubliceerde runs?** De oude priors zijn volgens deze audit systematisch scheef (S1). | Klanten hebben mogelijk al budget op die cijfers gestuurd. Automatisch herberekenen verandert stilzwijgend hun cijfers; niets doen laat scheve cijfers staan. | Markeren als `legacy` + zichtbare waarschuwing, **niet** automatisch herfitten; wel één klik om opnieuw te berekenen. |
| **2** | **Multi-tenant nu of later?** A1/A2 zijn P0 vóór de eerste externe klant, maar het raakt élke query en policy. | Bepaalt of fase 7 vooraan of achteraan komt. Als er voorlopig alleen interne builders zijn, kan het wachten. | Als er binnen 3 maanden een tweede organisatie op komt: fase 7 naar voren halen, direct na fase 1. Anders: op volgorde laten. |
| **3** | **Multi-region/hiërarchisch: houden of weggooien?** ~400 regels productiecode + tests die door geen UI-pad bereikbaar zijn (A10). | Het werkt en het is getest, maar het kost onderhoud bij elke wijziging aan de kern (fase 2 raakt het direct). | Weggooien in fase 10 en terughalen uit git als er een concrete klantvraag is. |
| **4** | **Wat is de minimale bruikbaarheidsdrempel?** Bij welk validatieniveau mag budgetadvies verschijnen, en bij welk niveau mag er überhaupt gepubliceerd worden? | Dit is een productbelofte, geen technische keuze. Strenger = minder modellen komen door; ruimer = meer risico op verkeerd advies. | Publiceren vanaf `STATISTICALLY_VALID` (met zichtbare kanttekeningen), budgetadvies pas vanaf `USABLE_FOR_DECISIONS`. |
| **5** | **Hoeveel mag een fit kosten?** De diagnostiek uit fase 4 maakt een run ~2,5× duurder. | Directe kostenimpact per klant. | Doen. Een goedkoop model waarvan je niet weet of het klopt is duurder dan een dure die je durft te publiceren. |
| **6** | **Eén bestand of meerdere bronnen?** De wizard doet nu één bestand; de hele onderliggende laag ondersteunt er meer (A8). | Bepaalt hoeveel van de ingestie-laag actief blijft. Jouw productdoel zegt "één definitieve, schone dataset". | MVP: expliciet één bestand, de multi-bron-code blijft maar wordt niet in de UI ontsloten. Dat scheelt een hoop fase-8-werk. |
| **7** | **Mag de gebruiker een `warn`-model naar de klant sturen?** | Vertrouwensvraag: transparantie versus "dan gebruikt niemand het". | Ja, mits het oordeel prominent op het dashboard staat en het budgetadvies-tabblad verborgen is. |
| **8** | **Kalibratie-experimenten: welk bewijs eisen we?** Een ROAS-kalibratie is de sterkste knop in het model (AI2). | Te streng = niemand gebruikt het; te los = het model wordt naar een gewenst antwoord geduwd. | Een verplicht formulier (experimenttype, periode, gemeten lift, betrouwbaarheidsinterval) + een expliciete bevestiging; alleen de builder-rol mag het invullen. |
| **9** | **Wordt `kpi_margin` een verplicht veld?** Zonder marge is break-even ROAS = 1,0, wat voor vrijwel elke retailer verkeerd is — en het dashboard geeft dan advies op de verkeerde drempel. | Extra frictie in de flow versus correct advies. | Verplicht maken vóór het budgetadvies-tabblad ontsluit, niet vóór de fit. |
| **10** | **Documentatie:** vier bestaande documenten (`MMM_README.md`, `MMM_APP_OVERDRACHTSDOCUMENT.md` 874 r., `MMM_HANDLEIDING_DATA_ANALIST.md` 723 r., `SIMPLIFICATION_PLAN.md`) beschrijven deels niet-bestaande componenten. | Alleen jij weet welke daarvan nog een lezer heeft. | Consolideren tot `docs/` met dit plan als index; de rest archiveren. |
| **11** | **Sander / bestecamerakeuze in dezelfde repo** (`app/sander/`, migratie `0020_sander_schema.sql`). | Buiten de scope van deze audit, maar het vervuilt de build, de CI en het typecheck-oppervlak. | Naar een eigen repo, of expliciet documenteren waarom het hier hoort. |

---

## Bijlage A — Wat expliciet goed is en blijft

Om te voorkomen dat een refactor per ongeluk goede beslissingen weggooit:

- **`mmm_core.ingestion`** — window-first imputatie, locale-bewuste currency-parsing,
  partiële randweken, coarse cadence, VIF, lokale robuuste-z-outliers,
  over-parameterisatie-guard. Dit blijft, en wordt uitgebreid, niet vervangen.
- **`mmm_core.transforms`** — adstock en saturatie zijn correct, causaal, genormaliseerd en
  getest.
- **`model/predict.py`** — spiegelt `build.py` component-voor-component met een gepinde
  in-sample-reproductie. Dat is precies de discipline die de rest van de kern ook nodig heeft.
- **De count-likelihood-attributie** — counterfactual-decompositie met Shapley-achtige
  herverdeling die exact optelt. Netjes gedaan en goed gedocumenteerd.
- **`derivePhase`** — een deterministische fase-machine; "chat-gestuurd ≠ LLM-gestuurd" is
  het juiste principe en het is echt zo geïmplementeerd.
- **`worker/ports.py` + injecteerbare fit** — de orkestratie is testbaar zonder cloud.
- **`mmm.publish_run()`** — atomaire RPC met champion-unpublish; het patroon is goed, er moet
  alleen een kwaliteitspoort bij.
- **`layeredTrustVerdict`** — het onderscheid tussen sampler-betrouwbaarheid en modelfit is
  precies de goede tweedeling; het wordt in fase 5 uitgebreid tot vier niveaus in plaats van
  weggegooid.
- **`lib/qualityIssueRegistry.ts`** — per issue-code een uitleg én een actie. Dit is het
  model voor hoe élke blokkerende melding in de nieuwe architectuur eruit moet zien.
- **De prompt-caching-breakpoints** in `architect.ts` — doordacht geplaatst (stabiele blokken
  vóór, volatiele erna).
