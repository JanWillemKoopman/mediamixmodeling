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
- `app/projects/[id]` — de wizard: 1 Data → 2 Model → 3 Fits (Realtime) → 4 Resultaten,
  met het chatpaneel-skelet ernaast.
- `app/api/jobs` — job aanmaken (queued) + Modal-worker porren (valt terug op `poll_queue`).
- `app/api/projects/[id]/publish` — resultaat publiceren naar het klantdashboard.
- `app/dashboard/[projectId]` — **klant-weergave**: alleen gepubliceerde resultaten,
  read-only, altijd met zichtbare credible intervals. Geen chat, geen ruwe data.
- `components/SummaryView.tsx` — gedeelde resultatenweergave (builder + klant).

## Rollen

- **Builder**: rij in `mmm.app_users` met `is_builder = true`. Ziet alles.
- **Klant**: krijgt via `mmm.project_access` toegang tot één gepubliceerd project. Ziet
  uitsluitend `/dashboard/<project>`. RLS dwingt dit af — een geraden project-id levert
  niets op.

Auth en toegang worden door Supabase RLS afgedwongen (zie `supabase/migrations/`); deze
app vertrouwt daarop en checkt de builder-rol daarnaast in de UI voor nette foutmeldingen.
