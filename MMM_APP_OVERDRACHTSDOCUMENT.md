# Overdrachtsdocument — MMM Wizard (`mmm/app`)

**Status van dit document:** feitelijke nulmeting van de huidige ("as-is") implementatie,
opgesteld ten behoeve van een volledige projectoverdracht. Het bevat uitsluitend een
beschrijving van wat er vandaag daadwerkelijk gebouwd en werkend is in de code — geen
aanbevelingen, verbeterpunten of roadmap. Het binnenkomende team (nieuwe eigenaar, product
owner, developers, data science) gebruikt dit als uitgangspunt om zelf een vervolgkoers te
bepalen.

**Scope:** de map `mmm/` in de repository. Dit is een volledig zelfstandig product dat
**naast** de wedding-planner-applicatie in dezelfde Git-repository leeft (die laatste is
alles buiten `mmm/` in de repo-root). Beide delen hebben eigen `package.json`,
dependencies, Supabase-schema's en deploy-doelen, en delen verder niets — geen code, geen
database-tabellen, geen gebruikers. Dit document gaat uitsluitend over `mmm/`.

`mmm/` bestaat uit vier onderdelen:

| Map | Taal / stack | Rol |
|---|---|---|
| `mmm/app/` | TypeScript / Next.js | De "wizard": de webapplicatie die de bouwer en de klant gebruiken. |
| `mmm/packages/mmm-core/` | Python | De bevroren, geteste statistische kern (ingestie, model, evaluatie, optimalisatie). |
| `mmm/worker/` | Python / Modal | De asynchrone rekenlaag die `mmm-core` off-request draait. |
| `mmm/supabase/` | SQL | Het databaseschema, Row Level Security en migraties. |

De hoofdopdracht van deze overdracht is de map `mmm/app`; omdat die map inhoudelijk niet
te begrijpen is zonder de kern die ze aanstuurt, beschrijft dit document ook `mmm-core` en
`mmm/worker` voor zover nodig om de datastroom en de modelkeuzes te verklaren.

---

## Inhoudsopgave

1. [Strategische Context & Productomschrijving](#1-strategische-context--productomschrijving)
2. [Architectuur & Technische Stack](#2-architectuur--technische-stack)
3. [Data Science, Modellen & Data-architectuur](#3-data-science-modellen--data-architectuur)
4. [Gebruikersflow & Functionele Werking](#4-gebruikersflow--functionele-werking)
5. [Codebase & Projectstructuur](#5-codebase--projectstructuur)
6. [Lokale Setup & Configuraties](#6-lokale-setup--configuraties)

---

## 1. Strategische Context & Productomschrijving

### 1.1 Wat de applicatie is

De MMM Wizard is een tool waarmee een **data-analist** ("de bouwer") zelfstandig een
Bayesiaans **Media Mix Model** (MMM) opzet voor een klantbedrijf: van ruwe, wekelijkse
marketingdata (omzet/leads en spend per kanaal) tot een afgeschermd, gepubliceerd
resultaten-dashboard dat de eindklant te zien krijgt. De applicatie kent daarmee twee
strikt gescheiden rollen:

- **Bouwer** — een technische operator (intern) die een project aanmaakt, ruwe data
  uploadt, die data laat samenvoegen en controleren, een modelconfiguratie samenstelt,
  een fit start, de uitkomst beoordeelt en uiteindelijk publiceert. De bouwer ziet alles:
  ruwe bestanden, tussentijdse datasets, mislukte fits, de volledige chatgeschiedenis met
  de AI-assistent.
- **Klant** — de eindklant van het marketingbureau. Deze gebruiker logt in en ziet
  uitsluitend het **gepubliceerde** dashboard van het eigen, aan hem/haar toegewezen
  project: geen chat, geen ruwe data, geen tussenresultaten, geen andere klanten.

### 1.2 De kernbelofte: laagdrempeligheid door een hybride architectuur

De centrale waardepropositie van de applicatie is dat de bouwer **geen** diepgaande kennis
van data engineering, statistiek of AI nodig heeft om een MMM-traject te doorlopen. Dat
wordt in de huidige implementatie op drie manieren waargemaakt:

1. **Eén bevroren, geteste statistische kern (`mmm-core`).** Alle zware wiskunde —
   data-uitlijning, adstock/saturatie-transformaties, het Bayesiaanse model zelf,
   diagnostiek, budgetoptimalisatie — is vaste, unit-geteste Python-code. De bouwer roept
   deze kern nooit rechtstreeks aan; die logica draait volledig verscholen achter de
   wizard-UI en de asynchrone worker. Er wordt nergens vrije code gegenereerd of uitgevoerd
   om de kernwiskunde te produceren.
2. **Een AI-"architect" die uitsluitend parametriseert, nooit rekent.** Een
   chat-assistent (Claude, via de Anthropic API) kijkt mee met de geüploade data en de
   fit-resultaten, en stelt concrete, gestructureerde voorstellen voor — een
   samenvoegrecept, een modelconfiguratie — via een beperkte, getypeerde tool-interface.
   De assistent schrijft nooit zelf statistische code; ze kiest alleen instellingen die de
   bevroren kern al ondersteunt (welk kanaaltype, welke na-ijlvorm, welke prior).
3. **Mens-in-de-lus op elke onomkeerbare stap.** Een voorstel van de architect wordt nooit
   automatisch uitgevoerd: de bouwer moet het expliciet overnemen in het formulier
   (met een zichtbare diff-samenvatting van wat er verandert), een samengevoegde dataset
   expliciet goedkeuren voordat er gefit wordt, en een fit-resultaat expliciet publiceren
   voordat de klant het ziet.

Een aparte, eveneens AI-gedreven stap ("diepgaande analyse") gebruikt Claude's
sandboxed code-executie om er, uitsluitend op basis van de reeds berekende
resultaten-JSON, een geschreven interpretatie én grafieken van te laten maken — dit is een
losstaande, expliciet getriggerde verrijking van een resultaat, niet onderdeel van de
statistische berekening zelf.

### 1.3 Kernwaarde op dit moment

In de huidige stand van de code is de volledige keten — bestand uploaden, data
verkennen, samenvoegen en goedkeuren, model configureren, fit starten, resultaten
bekijken, publiceren, klant-dashboard tonen — functioneel geïmplementeerd en end-to-end
verbonden (zie hoofdstuk 4). De chat-architect en de diepgaande-analysestap zijn
functioneel afgebouwd maar afhankelijk van een geconfigureerde `ANTHROPIC_API_KEY` op de
productieomgeving; zonder die sleutel geven de betreffende API-routes een expliciete
foutmelding (`503`) in plaats van stil te falen. Los daarvan biedt de statistische kern
(`mmm-core`) een aantal mogelijkheden — een hiërarchisch/geo-model met partiële pooling,
en planningsoutput (response curves/budgetoptimalisatie) voor tellings-KPI's — die wel
geïmplementeerd en getest zijn in `mmm-core`, maar nog niet aangesloten zijn op het
job-contract dat de wizard en de worker gebruiken (zie §3.5).

---

## 2. Architectuur & Technische Stack

### 2.1 Overzicht

```
┌─────────────────┐        ┌──────────────────────────────┐        ┌───────────────────┐
│   Next.js app    │◄──────►│           Supabase             │◄──────►│   Modal worker     │
│  (mmm/app,        │        │  Postgres (schema "mmm")       │        │  (mmm/worker,       │
│   Vercel)          │        │  Storage (2 buckets)            │        │   Python, serverless)│
└────────┬─────────┘        │  Auth + Row Level Security      │        └─────────┬─────────┘
         │                    │  Realtime                        │                  │
         │                    └──────────────────────────────┘                  │
         │                                                                          │
         └───────────────────────►  Anthropic Claude API  ◄────────────────────────┘
              (chat-architect,                                (mmm-core, Python:
               diepgaande analyse —                             ingestie + Bayesiaans
               vanuit app/api/*)                                model — draait hier)
```

- De **Next.js-app** (`mmm/app`) is het enige onderdeel dat gebruikers rechtstreeks
  bezoeken. Ze doet zowel de UI als een klein aantal server-side route handlers voor
  acties die niet veilig client-side kunnen (Claude-aanroepen, job-aanmaak, publiceren).
- **Supabase** is de enige gedeelde staat: Postgres-tabellen in een eigen schema `mmm`,
  twee private Storage-buckets voor bestanden, ingebouwde Auth (e-mail/wachtwoord +
  magic link) en Realtime voor live UI-updates. Row Level Security (RLS) is de enige
  autorisatiegrens tussen bouwer en klant.
- **Modal** hostet de Python-worker (`mmm/worker`) die de zware, tijdrovende taken
  (data samenvoegen, model fitten) buiten de request/response-cyclus van de webapp
  uitvoert.
- **Anthropic Claude** wordt uitsluitend vanuit de Next.js-server aangeroepen (nooit
  vanuit de worker): voor de chat-architect en voor de diepgaande-analysestap.

### 2.2 Technische stack — volledig overzicht

**Frontend/backend-app (`mmm/app`)**

| Laag | Technologie |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict mode) |
| Styling | Tailwind CSS 3 (één accentkleur `rose`, verder neutrale grijstinten) |
| Grafieken | Recharts |
| CSV-parsing (client-side) | PapaParse |
| Iconen | lucide-react |
| Supabase-clients | `@supabase/supabase-js` + `@supabase/ssr` (browser- én servervariant, cookie-based sessies) |
| AI | `@anthropic-ai/sdk` (officiële Anthropic TypeScript-SDK) |
| Linting/типing | ESLint via `next lint`, `tsc --noEmit` |
| Package manager | npm |

**Statistische kern (`mmm/packages/mmm-core`)**

| Laag | Technologie |
|---|---|
| Taal | Python ≥ 3.11 |
| Numeriek | numpy, pandas |
| Bayesiaans model (optionele `model`-extra) | PyMC ≥ 5.16, PyMC-Marketing, numpyro (NUTS-sampler-backend), ArviZ (diagnostiek/InferenceData) |
| Bestandslezen | openpyxl (xlsx) |
| Tests | pytest, met een `slow`-marker voor de end-to-end Bayesiaanse fit |
| Packaging | hatchling, dependency-beheer via `uv` |

**Worker (`mmm/worker`)**

| Laag | Technologie |
|---|---|
| Taal | Python ≥ 3.11 |
| Platform | Modal (serverless functions, secrets, scheduled functions) |
| Runtime-dependencies | `mmm-core[model]`, pandas, openpyxl, `supabase` (service_role-client), `modal` |
| Tests | pytest met in-memory fakes (geen cloud nodig) |

**Data & infrastructuur**

| Onderdeel | Technologie |
|---|---|
| Database | Supabase Postgres, eigen schema `mmm` (volledig los van de rest van het Supabase-project) |
| Bestandsopslag | Supabase Storage — twee private buckets: `mmm-raw-data` (ruwe uploads + samengevoegde master-CSV) en `mmm-artifacts` (zware `.nc`-posterior-traces) |
| Auth | Supabase Auth (e-mail/wachtwoord, magic link) |
| Realtime | Supabase Realtime (Postgres changefeeds) op `jobs`, `model_runs`, `datasets` |
| AI | Anthropic Claude API (model-ID's zie §3.6) |
| Hosting app | Vercel (impliciet — Next.js-conventies als `maxDuration`, environment variables) |
| Hosting worker | Modal (serverless Python) |

### 2.3 Technische structuur van `mmm/app`

De app volgt de Next.js App Router-conventie, met een strikte scheiding tussen
Server Components (data ophalen, sessie/RLS), Client Components (interactiviteit) en
Route Handlers (server-only acties):

- **Server Components** (`app/**/page.tsx`) — halen data direct op via de
  server-side Supabase-client (`lib/supabase/server.ts`), gebonden aan de
  request-cookies. Er zit geen aparte backend-laag tussen: leesqueries voor projecten,
  bestanden, datasets, jobs en resultaten gaan rechtstreeks van de Server Component naar
  Postgres, met RLS als toegangscontrole.
- **Client Components** (`components/*.tsx`, gemarkeerd `"use client"`) — verzorgen
  interactiviteit: uploaden, formulieren, Realtime-subscripties, chatvenster. Deze
  gebruiken de browser-Supabase-client (`lib/supabase/client.ts`) voor directe
  lees/schrijfacties (bijv. bestand uploaden, project aanmaken) en `fetch()` naar de
  eigen `/api/*`-routes voor acties die servergeheimen nodig hebben (Anthropic-sleutel)
  of die extra validatie/side-effects vereisen (job-capaciteitscheck, dataset-approval).
- **Route Handlers** (`app/api/**/route.ts`) — de enige plek waar servergeheimen
  (`ANTHROPIC_API_KEY`) gebruikt worden en waar acties met neveneffecten buiten een
  simpele CRUD-rij plaatsvinden: een chatbeurt met Claude, een diepgaande analyse, een
  `prepare`/`fit`-job aanmaken (met capaciteitscheck en een best-effort "nudge" richting
  Modal), een dataset goedkeuren, of een run publiceren.
- **Middleware** (`middleware.ts`) — ververst op elke request de Supabase-sessie zodat
  Server Components een geldige gebruiker zien; uitgesloten voor `/auth/*` en statische
  assets.

Er is geen aparte state-managementbibliotheek (geen Redux/Zustand in `mmm/app` — dat is
een keuze van de wedding-planner-app in de rest van de repo, niet van dit product).
Gedeelde UI-state binnen één projectpagina loopt via twee lichte React Contexts:

- `WizardChatContext` — verbindt het chatpaneel met de editors ernaast: een
  architect-voorstel (recept of modelconfig) wordt hierdoorheen aan de juiste editor
  aangeboden; omgekeerd kan een resultaatweergave (bijv. een kwaliteitspoort-waarschuwing)
  een kant-en-klare vraag naar de chat sturen.
- `PipelineShell`-context (`components/PipelineShell.tsx`) — houdt bij welke stappen
  open/dicht staan en welke stap "actief" is, zodat het chatpaneel context-relevante
  snelkeuzes kan tonen.

### 2.4 Asynchrone taakverwerking (job-architectuur)

Een fit kan minuten duren en hoort niet thuis in een request/response-cyclus van de
webapp of in een Claude tool-call. Daarom loopt alle rekenwerk via een jobqueue in
Postgres, opgepikt door Modal:

```
Wizard --insert job(queued)--> Supabase.jobs
   |                                  |
   |  POST /enqueue(job_id)           |  poll_queue (elke minuut, vangnet)
   v                                  v
Modal.run_fit --download sources--> Storage (mmm-raw-data)
   |  mmm-core: ingestie of fit
   |--summary JSON-----------------> Supabase.model_runs   (klein, snel voor dashboard)
   |--InferenceData .nc-------------> Storage (mmm-artifacts) (zwaar, ruwe posterior)
   `--status=succeeded/failed-------> Supabase.jobs          (Realtime -> wizard hoort het)
```

- Eén Modal-functie (`run_fit`) dispatcht op basis van het jobtype naar óf de
  data-preparatiestap (`run_prepare`, samenvoegen + kwaliteitscheck, géén model-fit) óf
  de volledige fit (`run_job`). Beide typen delen dezelfde containerpool
  (`max_containers = 2` op Modal, en een gelijke `MAX_CONCURRENT_JOBS = 2`-check in de
  wizard's `/api/jobs`- en `/api/datasets`-routes vóórdat een job wordt aangemaakt).
- `poll_queue` draait elke minuut als vangnet en pikt elke `queued`-job op die niet via
  de directe `enqueue`-aanroep is opgepikt (bijv. bij een mislukte webhook-call).
- De worker praat met Supabase via de **service_role**-sleutel en omzeilt daarmee RLS
  volledig — de worker is dus het enige onderdeel met onbeperkte toegang tot alle
  projecten.
- De worker-orchestratie (`mmm_worker/runner.py`, `mmm_worker/prepare.py`) is zelf
  ontkoppeld van Supabase/Modal: ze hangt alleen af van twee kleine Protocol-interfaces
  (`JobStore`, `Storage`, plus `DatasetStore` voor de prepare-flow) uit `ports.py`, met
  concrete Supabase-implementaties in `supabase_backends.py`. Hierdoor is de volledige
  taakafhandeling (statusovergangen, raw/artifact-scheiding, foutafhandeling) unit-getest
  met in-memory fakes, zonder cloud-afhankelijkheid.

### 2.5 Autorisatie & databeveiliging

- **Eén Postgres-schema (`mmm`)**, volledig geïsoleerd van de rest van het
  Supabase-project (dat ook niet-gerelateerde tabellen bevat).
- **Twee rollen**, afgedwongen via Row Level Security, niet via applicatielogica alleen:
  - `mmm.is_builder()` — een `SECURITY DEFINER`-SQL-functie die opzoekt of de ingelogde
    gebruiker een rij heeft in `mmm.app_users` met `is_builder = true`.
  - Bouwers hebben via RLS-policies (`for all using (mmm.is_builder())`) volledige
    toegang tot projecten, bronbestanden, datasets, jobs, chatberichten en modelresultaten.
  - Klanten hebben alléén een `select`-policy op `mmm.projects` (uitsluitend
    `status = 'published'` én een matchende rij in `mmm.project_access`) en op
    `mmm.model_runs` (uitsluitend `is_published = true` van een toegankelijk,
    gepubliceerd project). Op `source_files`, `jobs`, `datasets` en `chat_messages`
    bestaat er geen enkele policy voor klanten — dus geen toegang, punt uit.
  - De applicatielaag (`getViewer()` in `lib/auth.ts`, plus per-pagina/route checks)
    herhaalt deze rolcheck voor nette foutmeldingen in de UI, maar de daadwerkelijke
    beveiligingsgrens is de RLS-policy in Postgres.
- **Storage-buckets zijn private**; alleen bouwers (via dezelfde `is_builder()`-check,
  toegepast op `storage.objects`) kunnen objecten lezen/schrijven. Klanten krijgen nooit
  rechtstreeks toegang tot Storage — ze lezen uitsluitend de geaggregeerde JSON
  (`summary`, `quality`, `analysis`) die al in Postgres staat.
- **Wie een klant daadwerkelijk toegang geeft** (een rij toevoegen aan
  `mmm.project_access`) gebeurt niet via een schermonderdeel in `mmm/app` dat in deze
  codebase is aangetroffen — er is geen UI-component die deze tabel beheert.

---

## 3. Data Science, Modellen & Data-architectuur

### 3.1 End-to-end datastroom

```
Ruwe bestanden (CSV/XLSX)
   │  upload → Storage(mmm-raw-data) + rij in mmm.source_files
   ▼
EDA (volledig client-side, in de browser — geen server/AI-aanroep)
   │
   ▼
Samenvoeg-recept (PrepareRecipe): per bestand → transforms, datumkolom,
per kolom → rol (kpi/spend/control) + fill-strategie, event-dummy's, afgeleide features
   │  handmatig ingevuld ÓF architect-voorstel (chat) dat de bouwer overneemt
   ▼
'prepare'-job (Modal) → mmm_core.build_master_dataset()
   │  → aligned wekelijkse master-tabel + QualityReport + preview
   ▼
mmm.datasets-rij (status: draft → preparing → prepared/failed → approved)
   │  bouwer keurt expliciet goed
   ▼
Modelconfiguratie (JobConfig): KPI, kanalen (+ adstock/saturatie/priors/kalibratie),
controls, trend/seizoen, likelihood, sampling-preset
   │  handmatig (formulier of JSON) ÓF architect-voorstel dat de bouwer overneemt
   ▼
'fit'-job (Modal) → mmm_core.model.fit.fit_model() [PyMC + numpyro NUTS]
   │  → FitSummary (klein, JSON) + InferenceData (.nc, zwaar)
   ▼
mmm.model_runs-rij  →  summary → Postgres  |  .nc-trace → Storage(mmm-artifacts)
   │
   ├── ResultsView (bouwer): grafieken, kwaliteitspoort, budgetadvies, vergelijk-historie
   ├── optioneel: "diepgaande analyse" (Claude code-executie op de summary-JSON)
   └── Publiceren → model_runs.is_published = true + projects.status = 'published'
          │
          ▼
   Klant-dashboard (/dashboard/[projectId]) — alleen gepubliceerde summary + analysis
```

### 3.2 Ingestielaag: van losse bestanden naar één master-tabel

Dit is de laag die de complexiteit van "rommelige, uiteenlopende klantbestanden"
onzichtbaar maakt voor de bouwer. De volledige pipeline zit in
`mmm_core.ingestion.build_master_dataset()` en werkt zo:

1. **Per bron eerst optionele ruwe transforms** (`mmm_core.ingestion.transforms`,
   aangestuurd via `TransformSpec`), in vaste volgorde, vóórdat er kolommen een rol
   krijgen: `rename`, `drop_columns`, `filter_rows`, `drop_duplicates`, `scale`
   (eenheids-/valutaconversie), `combine`, `split`, `recode`, `parse_date` (forceren van
   een dubbelzinnig datumformaat), `pivot` (lang → breed). Dit is bewust **declaratief**:
   de architect (of de bouwer) stelt een lijst getypeerde bewerkingen voor; er wordt
   nergens vrije code uitgevoerd op de data.
2. **Datumdetectie & weekaggregatie** (`mmm_core.ingestion.dates`) — conservatieve
   auto-detectie van de datumkolom (numerieke kolommen worden alleen als datum
   geaccepteerd bij een ondubbelzinnig `YYYYMMDD`-patroon), rijen op een niet-parsebare
   datum worden gerapporteerd en verwijderd, en elke rij wordt toegewezen aan een
   ISO-week (maandag als indexdatum — bewust gekozen om jaargrens-edge-cases te
   vermijden).
3. **Aggregatie per kolomrol**: KPI en spend worden **gesommeerd** per week, controls
   worden **gemiddeld** — vastgelegd in `Role`/`aggregation_for()`.
4. **Naamsbotsingen** tussen bronnen worden automatisch opgelost door de bronnaam als
   prefix te gebruiken, met een waarschuwing in het kwaliteitsrapport.
5. **Bepaling van het analysevenster**: de overlappende periode waarin élke *essentiële*
   bron (KPI en spend zijn dat per definitie; controls kunnen `essential=False` zijn)
   data heeft. Buiten dat venster wordt niets gebruikt.
6. **Window-first, nooit-verzin-nul imputatie**: pas ná het bepalen van het venster
   worden ontbrekende spend-weken op 0 gezet (een ontbrekende week betekent "dit kanaal
   liep toen niet") — vóór het venster zou dat ten onrechte adstock/saturatie
   vervuilen. Gaten in KPI- of control-kolommen worden nooit stilzwijgend ingevuld: ze
   worden gerapporteerd, en een control-kolom wordt alleen gevuld als de bouwer/architect
   expliciet een `fill`-strategie koos (`zero`/`ffill`/`bfill`/`interpolate`/`mean`/
   `median`).
7. **Event-dummy's** — 0/1-controlekolommen voor met naam en ISO-week aangeduide
   anomalieën, toegevoegd ná het uitlijnen van het venster (geen noodzaak om het
   brondata-bestand te bewerken).
8. **Afgeleide features** (`mmm_core.ingestion.feature_engineering`) — declaratieve,
   op naam en volgorde uitvoerbare bewerkingen op reeds-aanwezige master-kolommen:
   `lag`, `rolling_mean`, `rolling_sum`, `diff`, `ratio`, `product`, `sum`, `log1p`,
   `zscore`, `winsorize`, `recurring_week_dummy` (terugkerende kalenderdummy, bv.
   Black Friday-week ieder jaar). Ook hier: een vaste catalogus van getypeerde
   bewerkingen, geen vrije code.
9. **Geautomatiseerde kwaliteitschecks**, elk als gestructureerd
   `QualityIssue` (severity `info`/`warning`/`error`) op het `QualityReport`:
   bijna-identieke kanalen (Pearson-correlatie boven een drempel — een aanwijzing voor
   confounding), jaarwisseling-anomalieën (robuuste MAD-z-score op de KPI in
   week 1/52/53), en lokale KPI-uitschieters over het hele venster (rollend-venster
   robuuste z-score, zodat ook een uitschieter midden in een langjarige, trending reeks
   met naam en waarde wordt gerapporteerd — niet alleen zichtbaar in de eerste/laatste
   weken van de preview).

Niets wordt ooit stil gemuteerd op een vermoeden: elke ingreep (imputatie, hernoemen,
vullen) wordt gelogd als een `QualityIssue`, zodat de bouwer (en de chat-architect, die
dit rapport leest) precies ziet wat er is gebeurd.

Het resultaat van een `prepare`-job wordt teruggeschreven als:
- de samengevoegde master-tabel (CSV) in `mmm-raw-data` (zodat een latere `fit`-job hem
  als gewone bron kan downloaden),
- een `mmm.datasets`-rij met venster, kolomrollen, het volledige kwaliteitsrapport en een
  compacte preview (eerste/laatste weken + per-kolom min/max/gemiddelde/ontbrekend) — dit
  is precies wat de bouwer ziet vóór goedkeuring, zonder het bestand zelf te hoeven
  downloaden.

### 3.3 Het statistische model (`mmm_core.model`)

Het model is een **Bayesiaans** Media Mix Model, gebouwd met PyMC en gesampled via de
numpyro NUTS-backend. Het is bewust een **gereedschapskist** met een vaste, geteste
standaardvorm, niet één hardcoded model:

- **Adstock (na-ijl) per kanaal** — `geometric` (piekt direct, standaard voor digitale
  kanalen) of `delayed` (piekt pas na een aantal weken — voor tv/radio/out-of-home).
  Beide zijn symbolisch geschreven in PyTensor (`mmm_core.model.build`) zodat hun
  parameters (`alpha`, en bij `delayed` ook `theta`) mee gesampled worden; de
  bijbehorende numpy-varianten in `mmm_core.transforms` zijn los unit-getest en worden
  hergebruikt voor out-of-sample voorspelling (`mmm_core.model.predict`).
- **Saturatie (afnemend rendement) per kanaal** — `hill` (flexibel, kan een S-curve
  aannemen; standaard) of `logistic` (één parameter minder, robuuster bij weinig/ruisige
  data).
- **Likelihood (ruismodel) op modelniveau** — `normal` (standaard, continue KPI),
  `student_t` (zware staarten, robuust tegen uitschieterweken), of, voor
  lage-aantallen-tellingen (bv. 5–50 leads/week): `poisson`/`negative_binomial` met een
  log-link. Voor de tellingsmodellen is de attributie per kanaal niet-additief; die wordt
  berekend via een counterfactual-decompositie (elk kanaal "uit" zetten en het verschil
  toerekenen, proportioneel geschaald zodat de som exact klopt).
- **Baseline** — intercept, optionele trend (`linear` of `piecewise` met instelbaar
  aantal changepoints, geplaatst over de eerste ~80% van het venster), optioneel
  seizoen via Fourier-termen (instelbare periode en aantal modes), en lineaire
  control-coëfficiënten.
- **Priors** — elk onderdeel (per kanaal én op modelniveau) heeft een expliciete,
  documenteerde default die het "oorspronkelijke" geometric+Hill+Normal-model exact
  reproduceert; elk veld is per klant overschrijfbaar (`ChannelPriors`,
  `BaselinePriors`).
- **Experiment-kalibratie** (`RoasCalibration`) — een gemeten incrementele ROAS uit een
  lift-/geo-experiment kan als zachte Gaussiaanse penalty worden toegevoegd op de
  impliciete ROAS van een kanaal, wat de schatting richting het experiment trekt zonder
  de data te overrulen.
- Alles wordt gefit in **geschaalde ruimte** (elk kanaal gedeeld door zijn max, KPI
  gedeeld door zijn max) zodat priors schaalvrij blijven en NUTS goed geconditioneerd is;
  de schalers worden bewaard voor terugrekenen naar originele eenheden.

Uit elke fit komt een `FitSummary` (de kleine JSON die naar Postgres gaat) met, per
kanaal, als (p3, p50, p97)-interval: absolute contributie, aandeel in de KPI, ROAS,
adstock-halfwaardetijd en verzadigingspunt, plus totale spend. Daarnaast:

- **Diagnostiek**: max R-hat, minimale ESS, aantal divergenties, R², MAPE, dekking van het
  94%-voorspellingsinterval, en een decompositie-sanity-check (telt alles precies op tot
  het totaal).
- **Automatische kwaliteitspoort** (`QualityGate`, verdict `pass`/`warn`/`fail`) — een
  vaste, auditeerbare set drempels (bv. R-hat > 1,1 = fail, > 1,05 = warn; > 2%
  divergerende samples = fail; R² < 0,3 = warn) die in mensentaal (Nederlands)
  uitlegt waarom een fit al dan niet vertrouwd mag worden. Dit is de basis van de
  waarschuwingsbanner die de bouwer én de klant in de resultatenweergave zien.

### 3.4 Planning-output: response curves, mROAS en budgetoptimalisatie

Bovenop elke fit (voor additieve-link-modellen — zie §3.5 voor de beperking bij
tellingsmodellen) berekent `mmm_core.optimize`, puur als post-processing op de reeds
gesamplede posterior (geen nieuwe sampling nodig):

- **Response curves** per kanaal — voorspelde contributie bij toenemende wekelijkse
  spend, hard begrensd tot net boven de historisch geteste maximale spend
  (extrapolatiepunten expliciet gemarkeerd, `extrapolated=True`).
- **Marginale ROAS** bij de huidige spend (de helling van de curve op dat punt).
- **Optimale herverdeling** van het huidige totale weekbudget over kanalen
  (`optimize_budget`), met veiligheidscaps.
- **Efficiency-frontier** — een sweep van 0,5× tot 2× het huidige totaalbudget, zodat
  zichtbaar is waar extra budget nog loont en waar het rendement afvlakt.

Deze planningscijfers landen rechtstreeks in de `FitSummary` (`response_curves`,
`optimal_allocation`, `efficiency_frontier`) en worden getoond in `SummaryView`/
`ResultsCharts` — zowel bij de bouwer als, indien gepubliceerd, bij de klant.

### 3.5 Mogelijkheden in `mmm-core` die (nog) niet aangesloten zijn op de wizard

De volgende twee capaciteiten zijn in `mmm-core` geïmplementeerd en unit-getest, maar
worden op dit moment niet bereikt via het job-contract dat de wizard/worker gebruiken
(`mmm_worker/jobspec.py` kent er geen velden voor, en er is geen UI voor):

- **Hiërarchisch / multi-regio model** (`mmm_core.model.hierarchical`) — een variant met
  partiële pooling waarbij elke regio een eigen kanaaleffect krijgt (getrokken uit een
  gedeelde verdeling), terwijl adstock/saturatie-vorm en de baseline-tijdscomponenten
  gedeeld blijven over regio's. De productieflow (upload → configuratie) werkt vandaag
  uitsluitend met één samengevoegde master-tabel, zonder regio-dimensie.
- **Planningsoutput (response curves/optimalisatie) voor tellings-likelihoods** —
  `_planning_outputs()` in `mmm_core.model.fit` slaat deze stap expliciet over zodra
  `likelihood.is_count` waar is (poisson/negative_binomial), omdat de log-link een
  andere (nog niet geïmplementeerde) afleiding van de steady-state-respons vereist.

Daarnaast bevat `mmm_core.evaluation` vier onafhankelijke betrouwbaarheidschecks
(tijdreeks-cross-validatie, placebo-test, prior-predictive check, modelvergelijking via
ArviZ LOO) die als geteste, aanroepbare functies bestaan, maar niet automatisch als
onderdeel van elke `run_job()`-uitvoering lopen — de kwaliteitspoort in §3.3 gebruikt wél
optionele `placebo_ok`/`cv_mape`-parameters in haar signatuur, maar `runner.py` roept de
fit vandaag aan zonder deze extra evaluaties uit te voeren.

### 3.6 De twee AI-lagen: architect (parametriseren) en diepgaande analyse (interpreteren)

Er zijn twee losstaande, duidelijk gescheiden Claude-integraties in `mmm/app`, beide
serverside (`app/api/chat`, `app/api/analysis`) en beide vereisen een
`ANTHROPIC_API_KEY` op de server:

**Chat-architect** (`lib/anthropic/architect.ts`, model `claude-sonnet-5`)
- Krijgt als context: een tekstpreview van elk geüpload CSV-bestand (eerste 15 regels;
  binaire xlsx-bestanden worden overgeslagen — de architect vraagt de bouwer dan om de
  kolomnamen te benoemen), de laatste dataset-voorbereiding (kwaliteitsrapport + preview),
  het laatste fit-resultaat of de laatst mislukte fit-job, en de volledige
  chatgeschiedenis van het project (opgeslagen in `mmm.chat_messages`).
- Heeft twee tools ter beschikking, elk met een uitgebreid, in het systeemprompt
  vastgelegd beslissingskader (kanaaltype/adstock/saturatie/likelihood/trend-keuzes,
  diagnose-vuistregels bij een mislukte of zwakke fit):
  - `propose_prepare_recipe` — een compleet samenvoegrecept (transforms, datumkolom,
    kolomrollen, fills, event-dummy's, afgeleide features).
  - `propose_model_config` — een complete modelconfiguratie (kanalen met
    adstock/saturatie/kalibratie, controls, trend/seizoen, likelihood, fijnafstembare
    priors).
- Routeert tussen twee "rollen" (beide wijzen vandaag naar hetzelfde model,
  `claude-sonnet-5`, zodat dit later eenvoudig te ontkoppelen is): een
  configuratie-rol (voorstel doen vanaf ruwe data) en een analist-rol (een
  kwaliteitsrapport of fit-resultaat interpreteren en verbeteren) — bepaald op basis van
  of er al iets te *interpreteren* valt.
- Gebruikt prompt-caching (Anthropic `cache_control: ephemeral`) op de vaste
  systeeminstructies en op de per-project data-contextblokken, zodat herhaalde beurten in
  hetzelfde project goedkoper zijn.
- Roept **nooit zelf iets uit**: een voorstel wordt alleen als knop ("Recept overnemen in
  de tabel" / "Voorstel overnemen in de editor") getoond; de bouwer moet expliciet
  klikken voordat het voorstel het bewerkbare formulier vult.

**Diepgaande analyse** (`lib/anthropic/deepAnalysis.ts`, model `claude-sonnet-5`,
Anthropic's hosted `code_execution`-tool)
- Expliciet getriggerd via een knop ("Genereer diepgaande analyse") in `ResultsView`,
  niet automatisch na elke fit.
- Krijgt uitsluitend de reeds berekende `FitSummary`-JSON van de meest recente run —
  geen ruwe klantdata, geen toegang tot Storage of het internet (de code-executie draait
  in een door Anthropic gehoste, sandboxed, netwerkloze omgeving).
- Produceert met Python (pandas/matplotlib) een vaste set grafieken (aandeel per kanaal
  mét onzekerheidsmarge, response-/verzadigingscurves, efficiency-frontier, plus 1–2
  zelfgekozen aanvullende grafieken) én een doorlopende Nederlandstalige analyse.
- Grafieken komen terug als los gegenereerde PNG-bestanden (via Anthropic's Files-API),
  worden gedownload en als base64 data-URL opgeslagen in de `analysis`-kolom
  (`jsonb`) van `mmm.model_runs` — dus zonder Storage-omweg, rechtstreeks leesbaar door
  zowel de bouwer als, na publicatie, de klant.
- Kent een resume-lus voor Anthropic's `pause_turn`-mechanisme (een server-tool-keten die
  na 10 iteraties pauzeert) met een hard maximum van 3 vervolgrondes, zodat een vastgelopen
  keten niet oneindig doorloopt.

### 3.7 Het contract tussen wizard en worker

De ene bron van waarheid voor "wat mag er in een job-configuratie staan" bestaat uit twee
onderling gespiegelde definities:

- **Frontend**: `lib/types.ts` (TypeScript-interfaces `JobConfig`, `PrepareRecipe`,
  `ChannelConfig`, etc.) — gebruikt door de formulieren, de JSON-editor en de
  architect-tool-schema's.
- **Worker**: `mmm_worker/jobspec.py` (`parse_job_config`/`parse_prepare_config`) — parseert
  en valideert exact dezelfde JSON-vorm naar `mmm-core`-objecten, met expliciete
  foutmeldingen bij een onbekend veld of ontbrekende verplichte sleutel.

Optionele fijnafstemvelden worden bewust **weggelaten** in plaats van als `null`
verzonden waar dat verschil er niet toe doet (met uitzondering van
`seasonality_periods`, waar `null` een eigen betekenis heeft: "seizoen expliciet uit").
Dit houdt zowel het aantal nullable/union-typefelden in de Anthropic-tool-schema's onder
de door Anthropic gehanteerde limiet, als de configuratie-JSON leesbaar voor een
mens die 'm handmatig aanpast.

---

## 4. Gebruikersflow & Functionele Werking

### 4.1 Bouwersflow — de wizard

Na inloggen (`/login`, e-mail/wachtwoord of magic link) komt een bouwer op
`/projects`: een lijst van projecten (één project = één klantmodel) met een
aanmaakformulier (naam + optionele klantnaam). Een project openen
(`/projects/[id]`) toont een verticale stappen-pijplijn (`PipelineShell`/
`PipelineStep`, met een railnavigatie op desktop en een compacte voortgangsregel op
mobiel) naast een inklapbaar chatpaneel. Elke stap heeft een automatisch afgeleide status
(`locked`/`available`/`active`/`attention`/`done` — zie `lib/pipelineStatus.ts`), zodat
de bouwer altijd ziet welke stap nu aandacht vraagt zonder een aparte
voortgangsadministratie:

1. **Data** (`SourceUpload`) — bestanden (CSV/XLSX) slepen of kiezen; elk bestand gaat
   naar de `mmm-raw-data`-bucket en krijgt een rij in `mmm.source_files`. Voor CSV's toont
   een client-side "sniff" meteen rijen/kolommen/datumbereik, zonder een serverronde.
   Bestanden zijn ook weer te verwijderen (met bevestiging).
2. **EDA** (`EdaSection`) — volledig client-side verkenning van een gekozen CSV: een
   zelf samen te stellen grafiek (lijn/staaf, meerdere y-kolommen als "small multiples"),
   kolomstatistieken (aantal, ontbrekend, gemiddelde, mediaan, std, kwartielen) met
   histogram, en een correlatiematrix tussen alle numerieke kolommen (met een
   toelichting dat sterk samenhangende spend-kolommen een risico zijn voor het model).
   Geen AI-aanroep, geen serverronde — alles draait op reeds gedownloade data in de
   browser.
3. **Data voorbereiden** (`DataPrepSection`) — per geüpload bestand: datumkolom,
   optionele ruwe opschoon-/hervormstappen, en per kolom een rol
   (KPI/spend/control/niet-gebruiken) met, voor controls, een fill-strategie. Een
   klein "voorstel"-badge suggereert `spend` voor kolomnamen die daarop lijken (puur als
   klikbare suggestie, nooit stilzwijgend vooringevuld). Eenmalige uitschieters
   (event-dummy's) en afgeleide variabelen (features) zijn in uitklapbare secties te
   beheren. Op "Controleer & voeg samen" ontstaat een `mmm.datasets`-rij en een
   `prepare`-job; de status (`draft → preparing → prepared/failed`) komt live binnen via
   Realtime. Een gratis, direct berekende **datakwaliteitsmeter** (`lib/dataHealth.ts` —
   geen AI, geen serverronde) geeft al vóór het samenvoegen een indicatie
   (goed/redelijk/zwak) op basis van aantal weken en het aandeel ontbrekende waarden.
   Na een geslaagde samenvoeging tonen het kwaliteitsrapport
   (`QualityReportView`) en een preview-tabel (`DatasetPreviewTable`, met per-kolom rol,
   gemiddelde, bereik en ontbrekend-aantal, plus eerste/laatste weken) het resultaat; de
   bouwer keurt de dataset expliciet goed ("Goedkeuren als definitieve dataset") voordat
   die als input voor een model mag dienen.
4. **Model configureren** (`ModelConfigForm`) — met een goedgekeurde dataset verschijnt
   een ingevuld formulier (KPI-keuze, per kanaal type/adstock/saturatie, aan/uit te
   vinken control-kolommen, een uitklapbaar trend/seizoen/likelihood-paneel, en een
   sampling-preset: snel/standaard/grondig, of een aangepaste combinatie via een
   architect-voorstel). Zonder goedgekeurde dataset valt het formulier terug op een
   rechtstreekse JSON-editor tegen de ruwe bestanden. Beide weergaves zijn onderling
   omzetbaar. "Fit starten" maakt een `fit`-job aan (met dezelfde
   twee-gelijktijdige-jobs-capaciteitscheck als de prepare-stap).
5. **Fits** (`JobList`) — een live lijst van fit-jobs met faselabel (brondata
   laden/dataset opbouwen/model fitten/resultaten opslaan), een lopende teller, en de
   mogelijkheid een nog-wachtende (niet: lopende) job te annuleren.
6. **Resultaten** (`ResultsView`) — een historie van alle runs (`RunHistory`, met een
   twee-op-twee-vergelijkingstabel), de volledige `SummaryView` voor de geselecteerde run
   (kernstatistieken met begrijpelijke tooltip-uitleg via een klein ingebouwd glossarium,
   een kwaliteitspoort-banner die alleen spreekt als er iets mis is, de deterministische
   grafieken uit `ResultsCharts` — aandeel/ROAS per kanaal met onzekerheidsmarge,
   respons-/verzadigingscurves, efficiency-frontier, budgetherverdelingsadvies — en een
   tabel per kanaal), een publiceerknop, en de optionele "Genereer diepgaande analyse"-
   actie.

Het chatpaneel (`ChatDock`/`ChatPanel`) staat naast de pijplijn, standaard open (met
onthouden voorkeur in `localStorage`), en biedt per actieve stap 1–2 relevante
snelacties (bv. "Stel een samenvoegrecept voor" bij stap 1, "Beoordeel de laatste fit"
bij stap 6). Een architect-voorstel verschijnt als chatbericht met een knop om het over
te nemen in de bijbehorende editor; de editor toont daarna een eenregelige samenvatting
van wat er precies veranderd is (bijv. "3 kolomrollen aangepast, +1 afgeleide
variabele").

### 4.2 Klantflow

Een klant logt in met hetzelfde inlogscherm, maar heeft geen `is_builder`-vlag. Bezoekt
de klant een projectpagina (`/projects/[id]`) of een bouwers-API, dan blokkeert de RLS
dat op databaseniveau; de UI toont een nette "Geen toegang"-pagina met uitlogknop
(`NoBuilderAccess`). De enige voor de klant bedoelde pagina is
`/dashboard/[projectId]`: een read-only weergave van uitsluitend het meest recent
**gepubliceerde** modelresultaat van het eigen (toegewezen) project — dezelfde
`SummaryView`/`AnalysisView`-componenten als bij de bouwer, zonder chatpaneel, zonder
ruwe data, met een vaste toelichting dat elke waarde een mediaan mét
94%-betrouwbaarheidsinterval is. Is er nog niets gepubliceerd, dan toont de pagina enkel
een tekstregel daarover.

### 4.3 Publiceren

Publiceren is een expliciete, aparte actie per run (niet automatisch na een geslaagde
fit): de bouwer kiest — eventueel na het vergelijken van meerdere runs in
`RunHistory` — welke run "de" gepubliceerde wordt. Dat zet `model_runs.is_published`
en `published_at`, én `projects.status`/`published_at`, zodat een project pas na deze
stap via de klant-RLS-policy zichtbaar wordt. Een eerder gepubliceerde, oudere run kan
zo vervangen worden door een latere, betere run; het mechanisme is telkens dezelfde
publish-actie.

---

## 5. Codebase & Projectstructuur

### 5.1 `mmm/app` — de wizard

```
mmm/app/
├── app/                              Next.js App Router
│   ├── page.tsx                      "/" — redirect naar /login of /projects
│   ├── login/page.tsx                 Inlogscherm (wachtwoord + magic link)
│   ├── auth/callback/route.ts         Wisselt magic-link-code voor sessie
│   ├── auth/signout/route.ts          Uitloggen
│   ├── projects/page.tsx              Projectenlijst + aanmaakformulier (builder-only)
│   ├── projects/[id]/page.tsx         De wizard: alle 6 pijplijnstappen + chatpaneel
│   ├── dashboard/[projectId]/page.tsx Klant-dashboard (read-only, alleen gepubliceerd)
│   ├── layout.tsx, globals.css        Root-layout, Tailwind-imports
│   └── api/
│       ├── chat/route.ts              GET (historie) / POST (chatbeurt met de architect)
│       ├── analysis/route.ts          POST — diepgaande analyse genereren (code_execution)
│       ├── datasets/route.ts          POST — dataset + 'prepare'-job aanmaken
│       ├── datasets/[id]/approve/route.ts  POST — dataset goedkeuren
│       ├── jobs/route.ts              POST — 'fit'-job aanmaken
│       └── projects/[id]/publish/route.ts  POST — run publiceren
│
├── components/
│   ├── ui.tsx                          Gedeelde bouwstenen: Card, PageHeader, StatusBadge,
│   │                                    TopBar, Term (glossarium-tooltip), MMM_GLOSSARY
│   ├── PipelineShell.tsx               Stappen-pijplijn-shell + context (open/actieve stap)
│   ├── SourceUpload.tsx                Stap 1 — bestand uploaden/verwijderen + sniff
│   ├── EdaSection.tsx                  Stap 2 — client-side data-verkenning
│   ├── DataPrepSection.tsx             Stap 3 — rol-mapping, transforms, features, approve
│   ├── DatasetPreviewTable.tsx         Preview-tabel van de samengevoegde master
│   ├── QualityReportView.tsx           Weergave van een QualityReport als zinnen
│   ├── ModelConfigForm.tsx             Stap 4 — modelconfiguratie (formulier + JSON-modus)
│   ├── JobList.tsx                     Stap 5 — live fit-joblijst
│   ├── ResultsView.tsx                 Stap 6 — resultatenweergave + publiceren + analyse
│   ├── RunHistory.tsx                  Historie + twee-runs-vergelijking
│   ├── SummaryView.tsx                 Gedeelde resultatensamenvatting (bouwer + klant)
│   ├── ResultsCharts.tsx               Deterministische Recharts-grafieken op de FitSummary
│   ├── AnalysisView.tsx                Weergave van de Claude-gegenereerde diepgaande analyse
│   ├── ChatDock.tsx                    Chatpaneel-chrome (in-/uitklappen, breedte)
│   ├── ChatPanel.tsx                   Het chatgesprek zelf + snelacties + voorstellen
│   ├── WizardChatContext.tsx           React Context: chat ↔ editors
│   ├── ProjectCreateForm.tsx           Projectaanmaakformulier
│   └── NoAccess.tsx                    "Geen toegang"-scherm voor niet-bouwers
│
├── lib/
│   ├── types.ts                        Domeintypes — spiegelt het Postgres-schema en het
│   │                                    job-contract met de worker
│   ├── auth.ts                         getViewer() — ingelogde user + builder-vlag
│   ├── jobs.ts                          Capaciteitscheck + Modal-enqueue-nudge
│   ├── pipelineStatus.ts               Afleiding van elke stapstatus (locked/active/…)
│   ├── dataHealth.ts                    Gratis, deterministische dataset-gezondheidsscore
│   ├── eda.ts                           Pure stats-helpers voor de EDA-stap (client-side)
│   ├── anthropic/
│   │   ├── architect.ts                Systeemprompt + tool-schema's + model-routing (chat)
│   │   ├── fitContext.ts                Fit-resultaat → Nederlandstalig contextblok
│   │   ├── datasetContext.ts           Dataset-voorbereiding → Nederlandstalig contextblok
│   │   └── deepAnalysis.ts              Request-opbouw voor de diepgaande-analysestap
│   └── supabase/
│       ├── client.ts                    Browser-Supabase-client
│       └── server.ts                    Server-Supabase-client (cookie-gebonden sessie)
│
├── middleware.ts                        Ververst de Supabase-sessie op elke request
├── tailwind.config.ts                   Eén accentkleur (rose), verder neutraal
├── next.config.mjs, tsconfig.json, postcss.config.mjs
└── package.json / package-lock.json
```

### 5.2 `mmm/packages/mmm-core` — de statistische kern

```
mmm/packages/mmm-core/
├── src/mmm_core/
│   ├── __init__.py                      Publieke re-exports (ingestie + transforms)
│   ├── features.py                       Gedeelde numerieke primitieven (fill, lag,
│   │                                      rolling, winsorize, zscore, outlier-detectie)
│   ├── optimize.py                       Response curves, mROAS, budgetoptimalisatie,
│   │                                      efficiency-frontier
│   ├── evaluation.py                     Cross-validatie, placebo-test, prior-predictive,
│   │                                      modelvergelijking (LOO)
│   ├── ingestion/
│   │   ├── spec.py                       ColumnSpec/SourceSpec/Role — databroncontract
│   │   ├── pipeline.py                   build_master_dataset() — de volledige merge
│   │   ├── quality.py                    QualityIssue/QualityReport
│   │   ├── transforms.py                 Ruwe per-bron table-transforms (rename/pivot/…)
│   │   ├── feature_engineering.py        Afgeleide features op de master (lag/ratio/…)
│   │   ├── events.py                     Event-dummy's (0/1-kolommen per ISO-week)
│   │   └── dates.py                       Datumdetectie + ISO-weekindeling
│   ├── model/
│   │   ├── config.py                     ModelConfig/ChannelConfig/Priors/Calibration
│   │   ├── build.py                      PyMC-modelopbouw (build_model)
│   │   ├── fit.py                        fit_model()/summarize_fit() → FitSummary
│   │   ├── predict.py                    Out-of-sample voorspelling / what-if
│   │   ├── hierarchical.py               Multi-regio model met partiële pooling
│   │   └── validation.py                 Decompositie-/dekkingschecks
│   └── transforms/
│       ├── adstock.py                     Geometric/delayed adstock (numpy)
│       └── saturation.py                  Hill/logistic saturatie (numpy)
└── tests/                                Uitgebreide pytest-suite per module (o.a.
                                            test_fit_recovery.py — herstel van bekende
                                            ground-truth-parameters)
```

### 5.3 `mmm/worker` — de asynchrone rekenlaag

```
mmm/worker/
└── mmm_worker/
    ├── modal_app.py         Modal-app: run_fit, enqueue (webhook), poll_queue (schedule)
    ├── runner.py             run_job() — download → align → fit → persist (fit-jobs)
    ├── prepare.py            run_prepare() — download → merge/check → persist (prepare-jobs)
    ├── jobspec.py             Parsing/validatie van job-config JSON naar mmm-core-objecten
    ├── ports.py                Protocol-interfaces (JobStore/Storage/DatasetStore)
    ├── tables.py               Ruwe bytes (csv/xlsx) → DataFrame
    └── supabase_backends.py    Concrete Supabase-adapters (service_role)
```

### 5.4 `mmm/supabase` — schema en migraties

```
mmm/supabase/migrations/
├── 0001_mmm_init.sql                       Schema mmm, app_users, projects, project_access,
│                                            source_files, jobs, model_runs, RLS-policies,
│                                            Storage-buckets, Realtime-publicatie
├── 0002_restrict_policies_to_authenticated.sql   Policies expliciet beperkt tot `authenticated`
├── 0003_grant_schema_access.sql             PostgREST-grants voor het schema (RLS blijft de
│                                            eigenlijke grens)
├── 0004_chat_messages.sql                   Chatgeschiedenis-tabel (builder-only)
├── 0005_datasets.sql                        Dataset-tabel (data-prep vóór modelleren) +
│                                            jobs.type uitgebreid met 'prepare'
├── 0006_model_run_analysis.sql              model_runs.analysis (diepgaande-analyse-JSON)
└── 0007_job_progress.sql                     jobs.progress (grove voortgangsfase tijdens fit)
```

---

## 6. Lokale Setup & Configuraties

### 6.1 De wizard (`mmm/app`)

```bash
cd mmm/app
cp .env.local.example .env.local     # publishable key is veilig client-side
npm install
npm run dev                          # http://localhost:3000
```

Benodigde environment variables (`.env.local.example`):

| Variabele | Doel |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-projectadres |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publieke Supabase-sleutel (client-side veilig) |
| `MMM_MODAL_ENQUEUE_URL` | Modal-webhook om een job direct te porren; leeg mag — `poll_queue` vangt het binnen een minuut op |
| `ANTHROPIC_API_KEY` | Server-only sleutel voor de chat-architect en de diepgaande analyse; apart van een eventuele persoonlijke Claude Code-login |

Verificatie (het project heeft geen testscript — `npm test` bestaat niet):

```bash
npm run typecheck    # tsc --noEmit
npm run build        # next build (bevat linting + type-checking)
```

`mmm/app` heeft een eigen `package.json`/`package-lock.json`, volledig los van het
`package.json` in de repository-root (dat hoort bij de wedding-planner-app). De
repository bevat een `SessionStart`-hook (`.claude/hooks/session-start.sh`) die bij het
opstarten van een cloud-sessie automatisch `npm install` draait — deze hook werkt op het
root-`package.json` van de wedding-planner-app en installeert dus niet automatisch de
dependencies van `mmm/app`; `npm install` in `mmm/app` moet daar apart gebeuren.

### 6.2 De statistische kern (`mmm/packages/mmm-core`)

```bash
cd mmm/packages/mmm-core
uv sync --extra dev          # numpy/pandas + pytest — niet de zware model-stack
uv run pytest                # snelle suite; fit-tests (marker "slow") worden overgeslagen

uv sync --extra dev --extra model   # + PyMC/numpyro/ArviZ
uv run pytest -m slow               # end-to-end Bayesiaanse fit tegen bekende ground truth (~30s)
```

### 6.3 De worker (`mmm/worker`)

```bash
cd mmm/worker
uv pip install -e ../packages/mmm-core -e ".[dev]"   # los geïnstalleerd i.v.m. path-dependency
uv run pytest                                          # volledig gemockt, geen cloud nodig
```

Deployen naar Modal (nodig na elke wijziging in `mmm-core` of `mmm/worker` die in echte
fits gebruikt moet worden — de Modal-worker draait anders de vorige versie door):

- **Via GitHub Actions** (workflow "Deploy MMM worker (Modal)", handmatig te starten
  onder het tabblad *Actions*), met eenmalig ingestelde repository-secrets
  `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`.
- **Vanaf een lokale machine**: `python -m modal deploy mmm_worker/modal_app.py`, na
  eenmalig `modal token new`.

Vereiste secrets komen uit een bestaande Modal Secret genaamd `mmm-supabase`:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # geheim — nooit in git of chat
MMM_RAW_BUCKET=mmm-raw-data
MMM_ARTIFACTS_BUCKET=mmm-artifacts
```

### 6.4 Supabase

- Eén Supabase-project (regio `eu-central-1`), met alle MMM-tabellen in het eigen schema
  `mmm` (zie §5.4 voor de migratievolgorde) en twee private Storage-buckets:
  `mmm-raw-data` (ruwe uploads + samengevoegde master-tabellen) en `mmm-artifacts`
  (zware `.nc`-posteriortraces).
- `mmm/.env.example` (op het niveau van `mmm/`, niet `mmm/app/`) bundelt de volledige set
  omgevingsvariabelen voor zowel de frontend als de worker, met een toelichting welke
  sleutel waar hoort (publishable key: client-side veilig; `service_role`-sleutel en
  DB-wachtwoord: uitsluitend server-/workergeheim, nooit committen).
- Rol- en toegangsbeheer (wie is `is_builder`, welke klant krijgt `project_access` tot
  welk project) gebeurt via rechtstreekse rijen in `mmm.app_users` /
  `mmm.project_access` — er is geen beheerscherm in `mmm/app` voor deze twee tabellen.

### 6.5 Overige configuratiebestanden in `mmm/app`

| Bestand | Inhoud |
|---|---|
| `tailwind.config.ts` | Eén expliciete accentkleur (`rose`), verder de Tailwind-standaardpalet; content-scan beperkt tot `app/` en `components/` |
| `tsconfig.json` | Strict TypeScript, pad-alias `@/*` → projectroot, Next.js-plugin |
| `next.config.mjs` | Minimale config (`reactStrictMode: true`) |
| `postcss.config.mjs` | Tailwind/Autoprefixer-pipeline |
| `middleware.ts` | Sessie-refresh op elke request, uitgezonderd statische assets en `/auth/*` |
