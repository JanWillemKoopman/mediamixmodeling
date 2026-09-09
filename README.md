# MMM Wizard

Een tool waarmee een marketeer via chat een **Bayesiaans media mix model** opzet: data
uploaden, samen met een AI-gids het model opbouwen, en een resultaat krijgen dat eerlijk
zegt hoe zeker het is. De klant ziet daarna een afgeschermd dashboard met alleen wat
statistisch verantwoord is om te tonen.

```
Next.js (Vercel)  ──►  Supabase (Postgres + Storage + Realtime + RLS)  ◄──  Modal (Python worker)
      │                                                                          │
      └──────────────────────  Claude API (uitleg + intentie)  ──────────────────┘
```

## Draaien

```bash
cp .env.local.example .env.local     # publishable key is veilig client-side
npm install
npm run dev                          # http://localhost:3000
```

De Python-kant (alleen nodig om de kern of de worker te draaien of te testen):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e "packages/mmm-core[model,dev]" -e "worker[dev]"
```

## Verificatie

```bash
npm run lint && npm run typecheck && npm run build   # frontend
pytest packages/mmm-core                             # statistische kern, snel
pytest packages/mmm-core -m slow                     # echte NUTS-fit: herstelmatrix
pytest worker/tests                                  # levenscyclus zonder database
```

Alle vier draaien ook in CI (`.github/workflows/ci.yml`).

## Structuur

| Map | Wat het is |
|---|---|
| `app/`, `components/`, `lib/` | Next.js: bouwerswizard + klantdashboard |
| `packages/mmm-core/` | De statistische kern (ingestie, priors, fit, diagnostiek, oordeel). Kent geen database en geen LLM. |
| `worker/` | De Modal-worker: state machine, claiming, storage, foutclassificatie. Bevat geen statistiek. |
| `supabase/migrations/` | Schema + RLS |
| `docs/` | Architectuur, refactorplan, archief |

- `app/projects/[id]` — de chat-gestuurde wizard: links een doorlopend gesprek dat de
  bouwer stap voor stap door het proces loodst (`lib/wizard/`), rechts een read-only
  model-dossier met de voortgang en alle vastgelegde kennis. De AI wordt alleen
  ingeschakeld bij vrij typen of een expliciet voorstel; de standaardflow is verder
  volledig deterministisch en kost geen tokens.
- `app/dashboard/[projectId]` — **klant-weergave**: alleen gepubliceerde resultaten,
  read-only, altijd met zichtbare onzekerheid. Geen chat, geen ruwe data.

## Rollen

- **Builder**: rij in `mmm.app_users` met `is_builder = true`. Ziet alles.
- **Klant**: krijgt via `mmm.project_access` toegang tot één gepubliceerd project. Ziet
  uitsluitend `/dashboard/<project>`. RLS dwingt dit af — een geraden project-id levert
  niets op.

## Uitgangspunten

1. **Statistische correctheid gaat vóór gemak.** Een model is niet goed omdat het
   klaar is met rekenen. Elk resultaat krijgt een oordeel in vier niveaus, en dat
   oordeel bepaalt wat er getoond mag worden — budgetadvies verschijnt niet voor een
   model dat zijn eigen drempel niet haalt.
2. **Deterministische software boven LLM-magie.** De AI legt uit, stelt vragen en doet
   voorstellen in een gesloten woordenschat van enums. Ze schrijft geen modelcode, zet
   geen priors en start geen berekening. Elke prior wordt in code afgeleid uit intentie
   plus gemeten data, met herleidbare herkomst.
3. **Onzekerheid blijft zichtbaar.** Ook — juist — voor de klant.
4. **De gebruiker hoeft geen statisticus te worden.** Foutmeldingen zijn Nederlands en
   oplossingsgericht (`lib/humanizeMessage.ts`); een traceback is voor de bouwer.

Meer: [`docs/ARCHITECTUUR.md`](docs/ARCHITECTUUR.md) (hoe het werkt) en
[`docs/MMM_REFACTOR_PLAN.md`](docs/MMM_REFACTOR_PLAN.md) (waarom het zo werkt).
