# sander

Volledig losstaande app binnen de `news`-repo. Deelt **geen** code, dependencies of
build met de mmm-wizard app in de root — eigen `package.json`, eigen `node_modules`,
eigen Next.js-config. Gebruikt wel hetzelfde Supabase-project, maar via een eigen
Postgres-schema (`sander`) zodat de data volledig gescheiden blijft van `mmm.*`.

## Draaien

```bash
cd sander
cp .env.local.example .env.local
npm install
npm run dev            # http://localhost:3001 (mmm-wizard draait op 3000)
```

Verificatie:

```bash
npm run typecheck
npm run build
```

## Supabase

- Schema: `sander` (zie `../supabase/migrations/00XX_sander_schema.sql` voor de
  aanmaak + RLS-basis). Voeg nieuwe tabellen/migraties toe in diezelfde map — het is
  één Supabase-project voor de hele repo, dus alle migraties lopen door één
  chronologische lijst.
- `lib/supabase/client.ts` / `server.ts` zetten `db.schema` standaard op `sander`, dus
  queries via deze clients raken nooit `mmm.*` tabellen aan.
- Auth (`auth.users`) is gedeeld met de rest van het Supabase-project — een
  ingelogde gebruiker bestaat project-breed. Autorisatie tot `sander`-data zelf loopt
  via RLS-policies op de `sander`-tabellen, net als bij `mmm`.

## Vercel

Nog niet gekoppeld. Om dit als apart Vercel-project te deployen: nieuw project
aanmaken, **Root Directory** instellen op `sander`, en de env vars uit
`.env.local.example` toevoegen.

## Structuur

- `app/` — Next.js App Router.
- `lib/supabase/` — browser- en server-clients, gebonden aan het `sander`-schema.
- `middleware.ts` — ververst de Supabase-sessie per request (zelfde patroon als de
  root-app).
