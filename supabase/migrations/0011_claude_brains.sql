-- MMM wizard — "meer ogen en meer brains voor Claude vóór de fit".
--
-- Vier uitbreidingen die de architect (Claude) een rijker, feitelijker beeld van de data
-- geven vóórdat er een recept of modelconfiguratie wordt voorgesteld:
--
--   1. source_files.profile  — een compacte, volledige-reeks STATISTISCHE PROFIEL per
--      geüploade CSV (min/max/mean/std/percentielen, ontbrekende weken, top-uitschieters
--      mét datum+waarde, kanaal-correlaties), client-side berekend bij upload. Vult het
--      gat dat de 15-regels-preview laat: een uitschieter of niveaubreuk buiten de eerste
--      weken was voorheen onzichtbaar voor Claude.
--   2. source_files.mapping  — het resultaat van een aparte, goedkope kolom-classificatie
--      (kanaal vs. KPI vs. control, eenheid/valuta, dag/week-granulariteit, lang/breed),
--      zodat de architect elke chatronde start met een betrouwbare kolom-semantiek i.p.v.
--      die opnieuw uit 15 rijen af te leiden.
--   3. mmm.data_inspections — de uitkomst van een DIEPE data-inspectie waarin Claude de
--      ruwe/samengevoegde data zelf met pandas verkent in de hosted code_execution-sandbox
--      (volledige tijdreeksen, seizoen, outliers over de hele periode, multicollineariteit).
--   4. mmm.project_context  — geëliciteerde ZAKELIJKE CONTEXT (branche, seizoensdrukte,
--      bekende campagnes, offline-kanalen, eerdere lift-tests) die de architect via een
--      gesprek ophaalt en vertaalt naar priors/kalibratie — het deel waar een Bayesiaans
--      model het meest aan heeft en dat nu vrijwel onbenut blijft.
--
-- Alles is builder-only (RLS), net als source_files/datasets. Klanten zien hier niets van.

-- 1 + 2 — profiel en kolom-mapping op de bronrij (net als `preview` in 0009).
alter table mmm.source_files
  add column if not exists profile jsonb,
  add column if not exists mapping jsonb;

-- 3 — diepe data-inspectie (code_execution). Eén rij per uitgevoerde inspectie; de
-- architect leest de nieuwste per project terug.
create table if not exists mmm.data_inspections (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references mmm.projects (id) on delete cascade,
  dataset_id   uuid references mmm.datasets (id) on delete set null, -- null = op ruwe bronnen
  scope        text not null default 'raw' check (scope in ('raw', 'master')),
  findings     jsonb,   -- gestructureerde bevindingen (zie lib/anthropic/dataInspection.ts)
  narrative    text,    -- doorlopende analyse in gewone taal
  model        text,
  error        text,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index if not exists data_inspections_project_idx
  on mmm.data_inspections (project_id, created_at desc);

alter table mmm.data_inspections enable row level security;
create policy data_inspections_builder_all on mmm.data_inspections
  for all using (mmm.is_builder()) with check (mmm.is_builder());

-- 4 — geëliciteerde zakelijke context per project. Eén rij per project (upsert); de
-- architect leest 'm terug en werkt 'm bij via de record_business_context-tool.
create table if not exists mmm.project_context (
  project_id   uuid primary key references mmm.projects (id) on delete cascade,
  industry     text,           -- branche/sector
  notes        jsonb,          -- vrije, getypeerde feiten (zie lib/anthropic/architect.ts)
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);

alter table mmm.project_context enable row level security;
create policy project_context_builder_all on mmm.project_context
  for all using (mmm.is_builder()) with check (mmm.is_builder());

-- Prior-predictive review (punt 7): een goedkope 'is deze config plausibel vóór we een
-- fit spenderen?'-check. Een nieuw, licht job-type dat de master bouwt en vraagt welk
-- KPI-bereik de priors alléén impliceren (geen MCMC); het resultaat komt op de job-rij.
alter table mmm.jobs drop constraint if exists jobs_type_check;
alter table mmm.jobs add constraint jobs_type_check
  check (type in ('fit', 'prepare', 'fit_hierarchical', 'prior_predictive'));
alter table mmm.jobs add column if not exists prior_predictive jsonb;
