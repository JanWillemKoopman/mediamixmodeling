-- 'sander' is een eigen route (/sander) binnen deze Next.js-app en deployment. Deelt
-- hetzelfde Supabase-project (en dus auth.users) met mmm-wizard, maar de data zelf leeft
-- in een eigen schema zodat er geen enkele overlap of afhankelijkheid met mmm.* tabellen
-- ontstaat.
create schema if not exists sander;

-- PostgREST exposeert alleen schemas die expliciet zijn toegevoegd aan de API-config
-- (Project Settings > API > Exposed schemas) — dat moet je in het Supabase-dashboard
-- nog handmatig toevoegen naast deze migratie.
grant usage on schema sander to anon, authenticated, service_role;
alter default privileges in schema sander grant all on tables to anon, authenticated, service_role;
alter default privileges in schema sander grant all on sequences to anon, authenticated, service_role;

-- Voorbeeldtabel zodat RLS-conventies vanaf de eerste migratie vaststaan; vervang/verwijder
-- gerust zodra het echte datamodel van sander bekend is.
create table sander.items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table sander.items enable row level security;

create policy "items_select_own" on sander.items
  for select using (auth.uid() = owner);

create policy "items_insert_own" on sander.items
  for insert with check (auth.uid() = owner);

create policy "items_update_own" on sander.items
  for update using (auth.uid() = owner);

create policy "items_delete_own" on sander.items
  for delete using (auth.uid() = owner);
