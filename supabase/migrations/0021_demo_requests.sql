-- Demo-aanvragen vanaf de publieke one-page (app/api/demo-request). Bewust een aparte,
-- kleine tabel: de aanvraag is nog geen project en hoort niet in het datamodel van de
-- wizard. Bezoekers zijn niet ingelogd, dus insert staat open voor `anon` — lezen kan
-- alleen een builder, precies zoals bij de rest van mmm.*.

create table if not exists mmm.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text not null,
  role text,
  budget text,
  message text,
  created_at timestamptz not null default now()
);

alter table mmm.demo_requests enable row level security;

-- Iedereen mag een aanvraag achterlaten; de route valideert lengtes en e-mailformaat en
-- vangt bots af met een honeypot-veld.
create policy "demo_requests_insert_public" on mmm.demo_requests
  for insert to anon, authenticated with check (true);

-- Alleen builders mogen de aanvragen inzien of opruimen.
create policy "demo_requests_read_builder" on mmm.demo_requests
  for select using (mmm.is_builder());

create policy "demo_requests_delete_builder" on mmm.demo_requests
  for delete using (mmm.is_builder());

create index if not exists demo_requests_created_at_idx on mmm.demo_requests (created_at desc);
