# mmm-wizard (Next.js)

De **bouwers-app**: een technische operator maakt een project aan, uploadt data,
configureert het model, start een fit (async op Modal), bekijkt de resultaten met
onzekerheidsmarges en publiceert een afgeschermd klantdashboard.

Zie `MMM_README.md` voor het overzicht van het hele project (Python-kern, worker,
database) en `MMM_APP_OVERDRACHTSDOCUMENT.md` voor een uitgebreide overdrachtsbeschrijving.

## Draaien

```bash
cp .env.local.example .env.local     # publishable key is veilig client-side
npm install
npm run dev                          # http://localhost:3000
```

Verificatie (projectstandaard — geen testsuite):

```bash
npm run typecheck    # tsc --noEmit
npm run build        # next build (lint + types)
```

## Structuur

- `middleware.ts` + `lib/supabase/{client,server}.ts` — Supabase-auth (SSR, publishable key).
- `lib/auth.ts` — `getViewer()`: ingelogde user + builder-vlag uit `mmm.app_users`.
- `app/login` — inloggen. `app/projects` — projectenlijst + aanmaken (builder-only).
- `app/projects/[id]` — de chat-gestuurde wizard: links een doorlopend gesprek dat de
  bouwer stap voor stap door het hele MMM-proces loodst (8 fases, zie
  `lib/wizard/phase.ts` + `lib/wizard/script.ts`: data uploaden → data-inspectie &
  kolomherkenning → data voorbereiden → zakelijke context → parameter-tuning →
  modelspecificatie → berekenen (Realtime) → valideren & publiceren), rechts een
  read-only model-dossier met de voortgang en alle vastgelegde kennis
  (`components/wizard/ChatWizard.tsx`, `components/wizard/ModelDossier.tsx`). De AI
  (Claude) wordt alleen ingeschakeld bij vrij typen of een expliciet AI-voorstel; de
  standaardflow is verder volledig deterministisch en kost geen tokens.
- `app/api/jobs` — job aanmaken (queued) + Modal-worker porren (valt terug op `poll_queue`).
- `app/api/projects/[id]/publish` — resultaat publiceren naar het klantdashboard.
- `app/dashboard/[projectId]` — **klant-weergave**: alleen gepubliceerde resultaten,
  read-only, altijd met zichtbare credible intervals. Geen chat, geen ruwe data.
- `components/SummaryView.tsx` — gedeelde resultatenweergave (builder + klant); de
  klant ziet een vereenvoudigd vertrouwensoordeel, de bouwer de volledige
  sampler-/fit-diagnostiek met terugnavigatie naar de betreffende wizardstap.

## Ontwerpfilosofie

Deze app volgt "Don't Make Me Think" (Steve Krug): elke stap moet vanzelfsprekend
zijn, zonder dat de gebruiker hoeft na te denken over wat iets betekent of wat de
volgende stap is. In de praktijk betekent dat:

- **Eén duidelijke volgende stap per scherm**, met vaste, geruststellende
  gesprekstaal (`lib/wizard/script.ts`) — geen jargon (MCMC, posterior,
  credible intervals) in de altijd-zichtbare UI-tekst.
- **Standaardwaarden zijn de happy path**: wie het niet zeker weet, klikt op
  "Laat de AI optimaliseren"; handmatige fijnafstemming staat achter een
  "geavanceerd"-inklap, nooit in de weg van de volgende stap.
- **Foutmeldingen zijn mensvriendelijk en oplossingsgericht** (`lib/humanizeMessage.ts`
  vertaalt elke technische fout naar begrijpelijk Nederlands, met de ruwe melding
  inklapbaar erbij voor wie het nodig heeft).
- **Minder is meer**: complexiteit wordt verborgen/verwijderd vóórdat er uitleg
  wordt toegevoegd — zie `SIMPLIFICATION_PLAN.md` voor de lopende analyse en
  optimalisatielijst.
- Dit alles **zonder** de rollen-/RLS-scheiding of de zichtbaarheid van credible
  intervals in het klantdashboard aan te tasten — versimpelen mag nooit
  correctheid of vertrouwen opofferen.

## Rollen

- **Builder**: rij in `mmm.app_users` met `is_builder = true`. Ziet alles.
- **Klant**: krijgt via `mmm.project_access` toegang tot één gepubliceerd project. Ziet
  uitsluitend `/dashboard/<project>`. RLS dwingt dit af — een geraden project-id levert
  niets op.

Auth en toegang worden door Supabase RLS afgedwongen (zie `supabase/migrations/`); deze
app vertrouwt daarop en checkt de builder-rol daarnaast in de UI voor nette foutmeldingen.
