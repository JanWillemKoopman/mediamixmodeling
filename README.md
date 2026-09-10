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
npm run lint && npm run typecheck && npm test && npm run build   # frontend
pytest packages/mmm-core                             # statistische kern, snel
pytest packages/mmm-core -m slow                     # echte NUTS-fit: herstelmatrix
pytest worker/tests                                  # levenscyclus zonder database
```

Alle vijf draaien ook in CI (`.github/workflows/ci.yml`).

## Structuur

| Map | Wat het is |
|---|---|
| `app/`, `components/`, `lib/` | Next.js: het bouwerstraject (`lib/flow/`) + klantdashboard |
| `packages/mmm-core/` | De statistische kern (ingestie, priors, fit, diagnostiek, oordeel). Kent geen database en geen LLM. |
| `worker/` | De Modal-worker: state machine, claiming, storage, foutclassificatie. Bevat geen statistiek. |
| `supabase/migrations/` | Schema + RLS |
| `docs/` | Architectuur, refactorplan, archief |

- `app/projects/[id]` — het traject van CSV tot begrepen uitkomst, in acht stappen
  (`lib/flow/`): links de stappenbalk met per stap wat er is besloten, rechts het gesprek en
  de kaart van de stap waar je staat. De toestand wordt deterministisch afgeleid uit de
  feiten plus het stappen-grootboek en kost geen tokens; de AI legt alleen uit en doet
  voorstellen. Zie [`docs/CHAT_PIPELINE_HERZIENING.md`](docs/CHAT_PIPELINE_HERZIENING.md).
- `app/logboek` — **het logboek** van een testronde: wat er is aangeklikt en wat er misging,
  browser en server op één tijdlijn, met een knop die het geheel kopieert voor Claude Code.
  Zie [`docs/LOGBOEK.md`](docs/LOGBOEK.md).
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
