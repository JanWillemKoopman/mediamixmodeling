-- MMM wizard — initial schema.
--
-- Everything lives in a dedicated `mmm` schema so it is fully isolated from anything
-- else in the project (this Supabase project already contains unrelated tables in
-- `public`; we never touch those).
--
-- Two roles, strictly separated:
--   * builder  -> technical operator; full access to everything (via mmm.is_builder()).
--   * client   -> may only read the PUBLISHED dashboard of projects they were granted,
--                 never chat, never raw data, never other clients, never the job queue.
-- The Modal worker connects with the service_role key, which bypasses RLS entirely.

create schema if not exists mmm;

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
create table if not exists mmm.app_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  is_builder  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- SECURITY DEFINER so the check itself is not subject to RLS recursion.
create or replace function mmm.is_builder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_builder from mmm.app_users where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Projects (one client engagement / one model build)
-- ---------------------------------------------------------------------------
create table if not exists mmm.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client_company  text,
  status          text not null default 'draft'
                    check (status in ('draft', 'published', 'archived')),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  published_at    timestamptz
);

-- which client users may view a published project
create table if not exists mmm.project_access (
  project_id  uuid references mmm.projects (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Uploaded raw source files (metadata only; bytes live in Storage)
-- ---------------------------------------------------------------------------
create table if not exists mmm.source_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references mmm.projects (id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  role_hint     text,
  uploaded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Async job queue picked up by the Modal worker
-- ---------------------------------------------------------------------------
create table if not exists mmm.jobs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references mmm.projects (id) on delete cascade,
  type         text not null default 'fit' check (type in ('fit')),
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  config       jsonb not null default '{}'::jsonb,
  error        text,
  attempts     int not null default 0,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index if not exists jobs_status_created_idx on mmm.jobs (status, created_at);
create index if not exists jobs_project_idx on mmm.jobs (project_id);

-- ---------------------------------------------------------------------------
-- Model run results: small aggregated JSON for the dashboard + pointer to the
-- heavy raw trace (.nc) in Storage.
-- ---------------------------------------------------------------------------
create table if not exists mmm.model_runs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references mmm.projects (id) on delete cascade,
  job_id               uuid references mmm.jobs (id) on delete set null,
  summary              jsonb not null,      -- FitSummary.to_json_dict()
  quality              jsonb,               -- ingestion QualityReport
  inference_data_path  text,                -- Storage path of the .nc trace
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  published_at         timestamptz
);
create index if not exists model_runs_project_pub_idx on mmm.model_runs (project_id, is_published);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table mmm.app_users     enable row level security;
alter table mmm.projects      enable row level security;
alter table mmm.project_access enable row level security;
alter table mmm.source_files  enable row level security;
alter table mmm.jobs          enable row level security;
alter table mmm.model_runs    enable row level security;

-- app_users: a user reads their own row; builders manage all.
create policy app_users_self_read on mmm.app_users
  for select using (id = auth.uid() or mmm.is_builder());
create policy app_users_builder_write on mmm.app_users
  for all using (mmm.is_builder()) with check (mmm.is_builder());

-- projects: builders full access; clients read only published projects granted to them.
create policy projects_builder_all on mmm.projects
  for all using (mmm.is_builder()) with check (mmm.is_builder());
create policy projects_client_read on mmm.projects
  for select using (
    status = 'published'
    and exists (
      select 1 from mmm.project_access pa
      where pa.project_id = mmm.projects.id and pa.user_id = auth.uid()
    )
  );

-- project_access: builders manage; a client can see their own grants.
create policy project_access_builder_all on mmm.project_access
  for all using (mmm.is_builder()) with check (mmm.is_builder());
create policy project_access_self_read on mmm.project_access
  for select using (user_id = auth.uid());

-- source_files & jobs: builders only. Clients have no policy -> no access at all.
create policy source_files_builder_all on mmm.source_files
  for all using (mmm.is_builder()) with check (mmm.is_builder());
create policy jobs_builder_all on mmm.jobs
  for all using (mmm.is_builder()) with check (mmm.is_builder());

-- model_runs: builders full access; clients read only PUBLISHED runs of accessible,
-- published projects. (This is the only marketing output a client ever sees.)
create policy model_runs_builder_all on mmm.model_runs
  for all using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_runs_client_read on mmm.model_runs
  for select using (
    is_published = true
    and exists (
      select 1
      from mmm.projects p
      join mmm.project_access pa on pa.project_id = p.id
      where p.id = mmm.model_runs.project_id
        and p.status = 'published'
        and pa.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage buckets (private) + builder-only object access.
-- Clients never touch Storage; they read aggregated JSON from Postgres only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('mmm-raw-data', 'mmm-raw-data', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('mmm-artifacts', 'mmm-artifacts', false)
  on conflict (id) do nothing;

create policy mmm_raw_builder_all on storage.objects
  for all using (bucket_id = 'mmm-raw-data' and mmm.is_builder())
  with check (bucket_id = 'mmm-raw-data' and mmm.is_builder());
create policy mmm_artifacts_builder_all on storage.objects
  for all using (bucket_id = 'mmm-artifacts' and mmm.is_builder())
  with check (bucket_id = 'mmm-artifacts' and mmm.is_builder());

-- ---------------------------------------------------------------------------
-- Realtime: let the wizard subscribe to job status + new results.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table mmm.jobs;
alter publication supabase_realtime add table mmm.model_runs;
