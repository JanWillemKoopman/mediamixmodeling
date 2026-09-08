-- MMM v2 — het datamodel dat een run reproduceerbaar en beoordeelbaar maakt.
--
-- Aanleiding (zie docs/MMM_REFACTOR_PLAN.md): in v1 was een resultaat na afloop niet meer
-- te reconstrueren. `model_runs.dataset_id` bestond wel maar werd door de worker nooit
-- gevuld; de configuratie stond alleen op `jobs` met `on delete set null`, dus zodra een
-- job verdween was niet meer te zeggen waarop een gepubliceerd cijfer gebaseerd was. Er
-- werd geen dataset-hash, geen seed, geen pakketversie vastgelegd. En omdat `jobs.status`
-- en `datasets.status` allebei dezelfde voortgang bijhielden, konden ze uit elkaar lopen.
--
-- Deze migratie vervangt dat door één keten waarin elke stap zijn eigen rij is:
--
--   source_files  ->  dataset_versions  ->  model_configurations  ->  model_runs
--                                                                       |
--                                        model_diagnostics (meting) <---+
--                                        model_validations (oordeel) <--+
--                                        model_results   (uitkomst) <---+
--
-- De `jobs`-tabel verdwijnt: `dataset_versions` én `model_runs` dragen hun eigen
-- toestandsmachine en zijn zelf de werkeenheid. Dat haalt de dubbele waarheid weg.
--
-- Alle bestaande data is testdata en mag weg (expliciet bevestigd), dus dit is een schone
-- herziening zonder migratiepad.

-- ---------------------------------------------------------------------------
-- Opruimen
-- ---------------------------------------------------------------------------
drop function if exists mmm.publish_run(uuid, uuid);
drop table if exists mmm.model_runs cascade;
drop table if exists mmm.jobs cascade;
drop table if exists mmm.datasets cascade;

-- ---------------------------------------------------------------------------
-- Bronbestanden: onveranderlijk na insert, en herkenbaar aan hun inhoud
-- ---------------------------------------------------------------------------
alter table mmm.source_files
  add column if not exists content_sha256 text,
  add column if not exists size_bytes     bigint,
  add column if not exists encoding       text,
  add column if not exists n_rows         int,
  add column if not exists n_columns      int;

-- Twee keer hetzelfde bestand uploaden is een vergissing, geen tweede bron.
create unique index if not exists source_files_project_content_idx
  on mmm.source_files (project_id, content_sha256)
  where content_sha256 is not null;

-- Dode kolom uit v1: de rol werd nooit uit dit veld gelezen.
alter table mmm.source_files drop column if exists role_hint;

-- ---------------------------------------------------------------------------
-- DatasetVersion — de samengevoegde, gecontroleerde weektabel
--
-- Draagt zijn eigen toestandsmachine (was: een aparte 'prepare'-job naast de
-- datasets-rij, met twee statussen die konden divergeren). `master_sha256` maakt van
-- deze rij een onveranderlijke versie: een model-run legt die hash vast, dus later is
-- altijd na te gaan of het resultaat bij deze data hoort.
-- ---------------------------------------------------------------------------
create table mmm.dataset_versions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references mmm.projects (id) on delete cascade,
  version_no      int  not null,
  source_file_ids uuid[] not null default '{}',
  recipe          jsonb not null default '{}'::jsonb,

  status          text not null default 'queued'
                    check (status in ('queued', 'building', 'ready', 'failed')),
  -- Claim/lease: alleen de worker die de rij daadwerkelijk claimt draait 'm.
  claimed_by      text,
  claimed_at      timestamptz,
  heartbeat_at    timestamptz,

  master_path     text,
  master_sha256   text,
  window_start    date,
  window_end      date,
  n_weeks         int,
  frequency       text,
  column_roles    jsonb,     -- {kolom: 'kpi'|'spend'|'control'}
  column_units    jsonb,     -- {kolom: 'currency'|'grp'|'impressions'|...}
  column_notes    jsonb,
  suitability     jsonb,     -- volledige geschiktheidsrapportage (issues + uitleg + actie)
  verdict         text check (verdict in ('usable', 'usable_with_warnings', 'not_usable')),

  error_code      text,
  error_message   text,      -- begrijpelijke tekst voor de gebruiker
  error_technical text,      -- alleen voor de bouwer

  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  built_at        timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references auth.users (id),

  unique (project_id, version_no)
);
create index dataset_versions_project_idx on mmm.dataset_versions (project_id, created_at desc);
create index dataset_versions_queue_idx  on mmm.dataset_versions (status, created_at)
  where status in ('queued', 'building');
-- Hoogstens één goedgekeurde datasetversie per project: anders is "welke data hoort bij
-- dit model" opnieuw een gok.
create unique index dataset_versions_one_approved_idx
  on mmm.dataset_versions (project_id) where approved_at is not null;

-- ---------------------------------------------------------------------------
-- ModelConfiguration — intentie én de daaruit afgeleide specificatie
--
-- `intent` is wat mens of AI heeft gezegd (gesloten woordenschat, geen getallen);
-- `resolved_spec` is wat mmm_core.model.priors daar deterministisch van heeft gemaakt.
-- Beide bewaren we: zonder de intentie is niet uit te leggen waaróm een prior is wat hij
-- is, en zonder de specificatie is de run niet te herhalen.
-- ---------------------------------------------------------------------------
create table mmm.model_configurations (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references mmm.projects (id) on delete cascade,
  dataset_version_id  uuid not null references mmm.dataset_versions (id) on delete cascade,

  intent              jsonb not null,
  resolved_spec       jsonb not null,
  spec_sha256         text  not null,
  provenance          jsonb,   -- per prior: waar het getal vandaan komt, in gewone taal
  issues              jsonb,   -- ConfigIssue[]: blokkerend / waarschuwing / info

  -- De prior-predictive poort. In v1 werd deze check wel gedraaid maar blokkeerde hij
  -- niets; hier is 'passed' een voorwaarde om een run te mogen starten.
  prior_predictive        jsonb,
  prior_gate_passed       boolean not null default false,
  prior_gate_checked_at   timestamptz,

  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now()
);
create index model_configurations_project_idx
  on mmm.model_configurations (project_id, created_at desc);
create index model_configurations_dataset_idx on mmm.model_configurations (dataset_version_id);

-- ---------------------------------------------------------------------------
-- ModelRun — één uitvoering, met alles wat nodig is om 'm te herhalen
-- ---------------------------------------------------------------------------
create table mmm.model_runs (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references mmm.projects (id) on delete cascade,
  -- Niet nullable en zonder `on delete set null`: een run zonder zijn configuratie is
  -- precies het gat dat v1 had.
  model_configuration_id  uuid not null references mmm.model_configurations (id) on delete cascade,
  dataset_version_id      uuid not null references mmm.dataset_versions (id) on delete cascade,

  -- Dezelfde specificatie op dezelfde data met dezelfde seed is dezelfde run. De unieke
  -- index maakt een dubbele enqueue (of een dubbele poll-spawn) structureel onschadelijk.
  idempotency_key         text not null unique,

  state                   text not null default 'queued' check (state in (
                            'queued', 'validating', 'preparing_data', 'building_model',
                            'sampling', 'validating_model', 'calculating_results',
                            'completed', 'failed', 'cancelled')),
  state_changed_at        timestamptz not null default now(),
  attempt                 int not null default 0,
  max_attempts            int not null default 2,
  claimed_by              text,
  claimed_at              timestamptz,
  heartbeat_at            timestamptz,
  cancel_requested        boolean not null default false,

  -- Reproduceerbaarheid: alles wat de uitkomst bepaalt.
  seed                    int not null default 0,
  sample_params           jsonb not null default '{}'::jsonb,
  dataset_sha256          text,
  spec_sha256             text,
  engine_version          text,
  mmm_core_version        text,
  package_versions        jsonb,
  worker_image_digest     text,

  error_code              text check (error_code is null or error_code in (
                            'DATA_QUALITY', 'CONFIG_INVALID', 'PRIOR_GATE_FAILED',
                            'SAMPLING_FAILED', 'TIMEOUT', 'OOM', 'STORAGE_UNAVAILABLE',
                            'CANCELLED', 'INTERNAL')),
  error_message           text,   -- begrijpelijke tekst
  error_technical         text,   -- alleen voor de bouwer
  log_tail                text,

  created_by              uuid references auth.users (id),
  created_at              timestamptz not null default now(),
  started_at              timestamptz,
  finished_at             timestamptz
);
create index model_runs_project_idx on mmm.model_runs (project_id, created_at desc);
create index model_runs_queue_idx   on mmm.model_runs (state, created_at) where state = 'queued';
create index model_runs_alive_idx   on mmm.model_runs (heartbeat_at)
  where state not in ('completed', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Meting, oordeel en uitkomst — bewust drie tabellen
--
-- Diagnostiek is een meting, validatie is een oordeel over die meting. Los houden
-- betekent dat een strengere drempel later nooit stilzwijgend een al gepubliceerde run
-- herwaardeert: de meting blijft staan, en het oordeel draagt de ruleset-versie waaronder
-- het geveld is.
-- ---------------------------------------------------------------------------
create table mmm.model_diagnostics (
  model_run_id   uuid primary key references mmm.model_runs (id) on delete cascade,
  convergence    jsonb,   -- R-hat, ESS bulk/tail, divergenties, E-BFMI, treedepth
  fit            jsonb,   -- R², MAPE, dekking op 50/80/94%, residu-autocorrelatie
  identifiability jsonb,  -- per kanaal: overlap, correlatie, intervalbreedte, gevoeligheid
  out_of_sample  jsonb,   -- holdout-MAPE
  placebo        jsonb,   -- toegekend aandeel aan een verzonnen kanaal
  created_at     timestamptz not null default now()
);

create table mmm.model_validations (
  model_run_id      uuid primary key references mmm.model_runs (id) on delete cascade,
  level             text not null check (level in (
                      'not_usable', 'technically_completed',
                      'statistically_valid', 'usable_for_decisions')),
  ruleset_version   text not null,
  allowed_outputs   text[] not null default '{}',
  blocking_reasons  text[] not null default '{}',
  warning_reasons   text[] not null default '{}',
  checks            jsonb,
  per_channel       jsonb,
  inseparable_groups jsonb,
  created_at        timestamptz not null default now()
);

create table mmm.model_results (
  model_run_id            uuid primary key references mmm.model_runs (id) on delete cascade,
  project_id              uuid not null references mmm.projects (id) on delete cascade,
  summary                 jsonb not null,
  inference_data_path     text,
  inference_data_sha256   text,
  analysis                jsonb,
  client_summary          jsonb,
  is_published            boolean not null default false,
  published_at            timestamptz,
  created_at              timestamptz not null default now()
);
create index model_results_project_idx on mmm.model_results (project_id, created_at desc);
-- Hoogstens één gepubliceerd resultaat per project.
create unique index model_results_one_published_idx
  on mmm.model_results (project_id) where is_published;

-- ---------------------------------------------------------------------------
-- Row Level Security — zelfde patroon als v1: bouwer alles, klant alleen gepubliceerd
-- ---------------------------------------------------------------------------
alter table mmm.dataset_versions     enable row level security;
alter table mmm.model_configurations enable row level security;
alter table mmm.model_runs           enable row level security;
alter table mmm.model_diagnostics    enable row level security;
alter table mmm.model_validations    enable row level security;
alter table mmm.model_results        enable row level security;

create policy dataset_versions_builder_all on mmm.dataset_versions
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_configurations_builder_all on mmm.model_configurations
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_runs_builder_all on mmm.model_runs
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_diagnostics_builder_all on mmm.model_diagnostics
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_validations_builder_all on mmm.model_validations
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());
create policy model_results_builder_all on mmm.model_results
  for all to authenticated using (mmm.is_builder()) with check (mmm.is_builder());

-- De klant ziet uitsluitend het gepubliceerde resultaat van een gepubliceerd project
-- waarvoor hij expliciet toegang heeft — plus het bijbehorende oordeel, want een cijfer
-- zonder de betrouwbaarheidsuitspraak erbij tonen is precies wat v1 deed.
create policy model_results_client_read on mmm.model_results
  for select to authenticated using (
    is_published
    and exists (
      select 1 from mmm.projects p
      join mmm.project_access pa on pa.project_id = p.id
      where p.id = mmm.model_results.project_id
        and p.status = 'published'
        and pa.user_id = auth.uid()
    )
  );
create policy model_validations_client_read on mmm.model_validations
  for select to authenticated using (
    exists (
      select 1 from mmm.model_results r
      join mmm.projects p        on p.id = r.project_id
      join mmm.project_access pa on pa.project_id = p.id
      where r.model_run_id = mmm.model_validations.model_run_id
        and r.is_published
        and p.status = 'published'
        and pa.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on all tables in schema mmm
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publiceren — nu mét kwaliteitspoort
--
-- In v1 controleerde publish_run alleen of de aanroeper een bouwer was en of de run bij
-- het project hoorde. Een run met verdict 'fail' kon dus gewoon naar het klantdashboard,
-- dat vervolgens budgetadvies toonde zonder het oordeel te noemen. De poort zit nu in de
-- database, niet in een route-handler die vergeten kan worden.
-- ---------------------------------------------------------------------------
create or replace function mmm.publish_run(p_project_id uuid, p_model_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  if not mmm.is_builder() then
    raise exception 'alleen een bouwer mag publiceren';
  end if;

  if not exists (
    select 1 from mmm.model_results
    where model_run_id = p_model_run_id and project_id = p_project_id
  ) then
    raise exception 'resultaat % hoort niet bij project %', p_model_run_id, p_project_id;
  end if;

  select level into v_level
    from mmm.model_validations where model_run_id = p_model_run_id;

  if v_level is null then
    raise exception 'deze berekening is nog niet beoordeeld en kan niet gepubliceerd worden';
  end if;
  if v_level not in ('statistically_valid', 'usable_for_decisions') then
    raise exception
      'deze berekening haalt de kwaliteitsdrempel niet (oordeel: %) en mag niet naar de klant',
      v_level;
  end if;

  update mmm.model_results
    set is_published = false
    where project_id = p_project_id and model_run_id <> p_model_run_id and is_published;

  update mmm.model_results
    set is_published = true, published_at = now()
    where model_run_id = p_model_run_id;

  update mmm.projects
    set status = 'published', published_at = now()
    where id = p_project_id;
end;
$$;

grant execute on function mmm.publish_run(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Claimen met compare-and-set
--
-- v1 deed `update jobs set status='running'` zonder te kijken wat de vorige status was,
-- en poll_queue spawnde elke minuut opnieuw álle 'queued' rijen. Een job die door een
-- koude start langer dan een minuut in de wachtrij stond werd dus dubbel uitgevoerd:
-- twee fits, twee resultaatrijen, dubbele kosten. Deze functies geven alleen `true` terug
-- aan de eerste claimer.
-- ---------------------------------------------------------------------------
create or replace function mmm.claim_model_run(p_run_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed int;
begin
  update mmm.model_runs
    set state = 'validating',
        state_changed_at = now(),
        claimed_by = p_worker,
        claimed_at = now(),
        heartbeat_at = now(),
        started_at = coalesce(started_at, now()),
        attempt = attempt + 1
    where id = p_run_id and state = 'queued';
  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

create or replace function mmm.claim_dataset_version(p_dataset_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed int;
begin
  update mmm.dataset_versions
    set status = 'building',
        claimed_by = p_worker,
        claimed_at = now(),
        heartbeat_at = now()
    where id = p_dataset_id and status = 'queued';
  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

grant execute on function mmm.claim_model_run(uuid, text) to service_role;
grant execute on function mmm.claim_dataset_version(uuid, text) to service_role;

-- Volgende versienummer per project, zonder race tussen twee gelijktijdige uploads.
create or replace function mmm.next_dataset_version_no(p_project_id uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  select coalesce(max(version_no), 0) + 1
    from mmm.dataset_versions where project_id = p_project_id;
$$;
grant execute on function mmm.next_dataset_version_no(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table mmm.dataset_versions;
alter publication supabase_realtime add table mmm.model_runs;
alter publication supabase_realtime add table mmm.model_results;

-- ---------------------------------------------------------------------------
-- Dode kolommen uit v1
-- ---------------------------------------------------------------------------
-- De EDA-stap bestaat niet meer; deze vlag werd nergens gelezen.
alter table mmm.projects drop column if exists eda_completed_at;
