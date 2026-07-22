-- Grant the coarse-grained schema/table privileges PostgREST needs to even attempt a
-- query against the `mmm` schema. RLS (0001) remains the actual security boundary —
-- these grants only let the anon/authenticated roles reach the RLS check in the first
-- place; policies already restrict `mmm` tables `to authenticated`, so `anon` still
-- gets zero rows in practice.

grant usage on schema mmm to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema mmm to anon, authenticated, service_role;
grant usage, select on all sequences in schema mmm to anon, authenticated, service_role;

-- Apply the same grants automatically to any table/sequence added later.
alter default privileges in schema mmm
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema mmm
  grant usage, select on sequences to anon, authenticated, service_role;
