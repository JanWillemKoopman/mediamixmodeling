-- MMM wizard — data-preparation datasets.
--
-- A "dataset" is the interactive data-prep artifact that comes BEFORE modelling: the
-- builder uploads several raw files, the architect proposes a mapping (which column is
-- date/kpi/spend/control) + prep choices (fills, event dummies), a fast `prepare` job
-- runs the frozen mmm-core ingestion to MERGE and QUALITY-CHECK them into one aligned
-- weekly master table, and the builder reviews the report + preview and APPROVES it.
-- The approved dataset is the single definitive input the fit then runs on.
--
-- The heavy merged file lives in Storage (mmm-artifacts); this row keeps the recipe, the
-- pointer to that file, and the small JSON the wizard needs (quality report + preview).

create table if not exists mmm.datasets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references mmm.projects (id) on delete cascade,
  status        text not null default 'draft'
                  check (status in ('draft', 'preparing', 'prepared', 'failed', 'approved')),
  recipe        jsonb not null default '{}'::jsonb,  -- sources + mapping + event_dummies
  master_path   text,                                -- Storage path of the merged master CSV
  window_start  date,
  window_end    date,
  n_weeks       int,
  column_roles  jsonb,                               -- {column_name: 'kpi'|'spend'|'control'}
  quality       jsonb,                               -- ingestion QualityReport (issues)
  preview       jsonb,                               -- {columns, head, tail, per-column summary}
  error         text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  prepared_at   timestamptz,
  approved_at   timestamptz
);
create index if not exists datasets_project_status_idx on mmm.datasets (project_id, status);

-- The async queue now carries a second, lightweight job type: 'prepare' (merge + check,
-- no fit). The fit job may reference an approved dataset.
alter table mmm.jobs drop constraint if exists jobs_type_check;
alter table mmm.jobs add constraint jobs_type_check check (type in ('fit', 'prepare'));

-- Link a fit back to the dataset it consumed (nullable: legacy fits ran from raw sources).
alter table mmm.jobs add column if not exists dataset_id uuid references mmm.datasets (id) on delete set null;
alter table mmm.model_runs add column if not exists dataset_id uuid references mmm.datasets (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row Level Security — builder-only, exactly like source_files/jobs. Clients never see
-- raw or prepared data; they only ever read published model_runs.
-- ---------------------------------------------------------------------------
alter table mmm.datasets enable row level security;
create policy datasets_builder_all on mmm.datasets
  for all using (mmm.is_builder()) with check (mmm.is_builder());

-- Let the wizard subscribe to prepare progress (draft -> preparing -> prepared/failed).
alter publication supabase_realtime add table mmm.datasets;
