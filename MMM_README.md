# MMM — Media Mix Model Wizard

Een tool waarmee technische bouwers via chat een Bayesiaans marketing-attributie­model
(Media Mix Model) opzetten voor klantbedrijven, waarna de klant een afgeschermd
dashboard met de resultaten ziet.

## Architectuur (doel)

```
Next.js (Vercel)  <-->  Supabase (Postgres + Storage + Realtime + RLS)  <-->  Modal (Python worker)
       |                                                                          |
       └──────────────────────  Claude API (redenering)  ───────────────────────┘
```

**Kernprincipe: de statistiek is bevroren, geteste code.** De zware wiskunde
(data-opbouw, adstock/Hill-saturatie, attributie, response curves) zit in een vaste
Python-package met unit-tests en bekende testdatasets. Claude *parametriseert* die kern
per klant (priors, uitsluitperiodes, dummy's) — het schrijft de kernwiskunde niet elke
keer opnieuw. Elke uitkomst wordt gevalideerd met een sanity check voordat we 'm
vertrouwen.

## Twee rollen, strikt gescheiden

- **Bouwer** (ik/collega's): volledige wizard, chatpaneel, ruwe data, modelconfiguratie,
  ziet ook onafgeronde tussenversies.
- **Klant**: alleen het afgeronde dashboard van het eigen project, ná een expliciete
  "publiceer"-stap. Nooit chat, nooit ruwe data, nooit inzicht in andere klanten.

## Bouwvolgorde

1. ✅ **Statistische kern** (`packages/mmm-core`) — compleet en getest tegen ground truth.
   Inmiddels een volledige *gereedschapskist*: meerdere adstock- (geometric/delayed) en
   saturatievormen (Hill/logistic), instelbaar ruismodel (normal/student_t), volledig
   instelbare priors, feature-engineering & cleaning (`mmm_core.features`), out-of-sample
   voorspelling (`mmm_core.model.predict`) en evaluatie (`mmm_core.evaluation`:
   cross-validatie, placebo, prior-predictive, modelvergelijking). Alle defaults
   reproduceren het originele model; elke uitbreiding is per klant opt-in via de config.
2. ✅ **Job-queue end-to-end** (`worker/` op Modal + `supabase/` schema) — worker-code en
   migratie klaar; migratie nog toe te passen op de database.
3. ✅ **Rollen + Row Level Security** in Supabase — in `supabase/migrations/0001_mmm_init.sql`
   (builder vs. client, strikt gescheiden).
4. 🟡 **Wizard (bouwersrol)** — skelet klaar in `app/` (project → data → model → fit →
   resultaten → publiceren). Het **chatpaneel** (`app/api/chat`) is een MMM-architect met
   twee rollen: hij beoordeelt de data en stelt een modelconfiguratie voor (Claude
   Sonnet 5), én — zodra er een fit is gedraaid — leest hij de resultaten terug
   (kwaliteitspoort, diagnostiek, bijdragen), legt ze uit, en stelt een verbeterde config
   voor of diagnosticeert een mislukte fit (Claude Opus, gekozen op basis van context in
   `lib/anthropic/fitContext.ts`). Mens-in-de-lus: hij stelt voor, de bouwer klikt. Werkt
   zodra `ANTHROPIC_API_KEY` in Vercel staat; nog niet end-to-end live getest.
5. 🟡 **Klantdashboard** — afgeschermde read-only weergave in `app/dashboard/[projectId]`,
   altijd met zichtbare onzekerheidsmarges (gedeelde `SummaryView`).
6. ⬜ Generaliseren naar uiteenlopende databronnen (kolom-mapping als eigen stap,
   kanaaltype i.p.v. kanaalnaam raden). Testen met ≥2 echt verschillende bedrijven.

## Meer ogen & meer brains voor Claude vóór de fit

Alles wat de dataset opbouwt die aan de Modal-fit wordt gegeven, is aangescherpt zodat de
Claude API maximaal wordt benut (migratie `0011_claude_brains.sql`):

- **Rijke statistische profielen** (`lib/dataProfile.ts`) — bij upload wordt per bestand een
  volledige-reeks-profiel berekend (percentielen, gaten, uitschieters mét week+waarde,
  kanaal-correlaties) en meegegeven aan de architect. De 15-regels-preview zag alleen de
  eerste rijen; het profiel ziet alles.
- **Diepe data-inspectie** (`lib/anthropic/dataInspection.ts`, `app/api/inspect`) — Claude
  verkent de echte CSV('s) met pandas in de hosted, afgeschermde `code_execution`-sandbox
  (seizoen, niveaubreuken, multicollineariteit) en levert gestructureerde bevindingen +
  voorstellen die de architect meeleest. Knop in de data-voorbereidingsstap.
- **Aparte kolom-classificatie** (`lib/anthropic/columnMapping.ts`, `app/api/classify-columns`)
  — een goedkope Haiku-call bepaalt per kolom rol/eenheid/granulariteit/vorm, zodat de
  architect start met een betrouwbare mapping.
- **Prior-elicitatie** — de architect vraagt actief naar branche, seizoen, campagnes,
  offline-kanalen en experimenten en legt ze vast (`record_business_context` →
  `mmm.project_context`), en vertaalt ze naar priors/kalibratie/`channel_type`.
- **NL kalender-features** (`lib/calendar/nlCalendar.ts`) — de architect kent terugkerende
  NL-gebeurtenissen (Black Friday, kerst, vakanties) en stelt kalender-dummies voor.
- **Prior-predictive review vóór de fit** (`worker/mmm_worker/prior_predictive.py`, job-type
  `prior_predictive`) — een goedkope check (geen MCMC) van het KPI-bereik dat de priors
  impliceren; de architect leest 'm en corrigeert de config vóór er Modal-compute wordt
  gespendeerd.
- **Agentic auto-verfijn** (`app/api/prepare-auto`) — de architect stelt een samenvoeg-recept
  voor, het draait, het kwaliteitsrapport gaat als echte `tool_result` terug, en hij
  corrigeert tot het rapport schoon is — de triviale rondes zonder mens in de lus. De bouwer
  keurt de uiteindelijke dataset nog steeds zelf goed.
- **Auto-verbetercyclus voor de fit** (`app/api/fit-refine` + toggle in `JobList`) — de
  tegenhanger voor de dure stap: bij een mislukte of warn/fail-fit diagnosticeert de
  architect, start een gecorrigeerde fit, en herhaalt zodra die klaar is (client-gedreven
  via Realtime, max. 3 rondes). Elke ronde is zichtbaar in de projectchat.
- **Proactieve fit-terugkoppeling** (`JobList` → chat) — zodra een live gevolgde fit
  slaagt of faalt, stuurt de UI automatisch de beoordelingsvraag naar de architect en
  klapt de chat open.
- **Streaming chat + context-transparantie** (`app/api/chat` NDJSON-stream, `ChatPanel`) —
  antwoorden streamen live (met stop-knop), en een chip-regel toont welke context de
  architect meeleest. De architect ziet nu ook de **run-historie** (laatste 4 runs) om
  runs te vergelijken.
- **Klantsamenvatting** (`lib/anthropic/clientSummary.ts`, `app/api/client-summary`,
  migratie `0013`) — presentatieklare NL-samenvatting in klanttaal per run, opgeslagen op
  `model_runs.client_summary`.

Deze onderdelen type-checken (`npm run typecheck`) en de worker-tests zijn groen
(`worker/tests`), maar zijn — net als de rest van de wizard — nog niet end-to-end live getest.

## Mappen

- `app/`, `components/`, `lib/`, `store/` — de Next.js-wizard (frontend).
- `packages/mmm-core/` — de bevroren statistische kernbibliotheek (Python, `uv`).
  Begin hier. Zie `packages/mmm-core/README.md`.
- `worker/` — de asynchrone Modal-worker die de fit off-request draait. Zie
  `worker/README.md`.
- `supabase/migrations/` — schema + Row Level Security (MMM in een eigen `mmm`-schema,
  geïsoleerd van de overige tabellen in het project).
- `MMM_PYTHON.env.example` — benodigde environment variables voor de Python-kant
  (secrets nooit committen).
- `.env.local.example` — benodigde environment variables voor de Next.js-app.
