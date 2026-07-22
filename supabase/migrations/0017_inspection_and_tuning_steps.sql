-- Supports the revised chat-first wizard flow: two explicit confirmation points that used
-- to be silently folded into other steps.
--
-- `source_files.inspection_confirmed_at` — the builder has explicitly confirmed the
-- column-recognition step (date column + granularity, KPI, channel roles/units, controls,
-- coverage period) before any cleaning/merging happens. Without this flag, "inspection"
-- and "prepare" cannot be two separate wizard phases — there is no signal that recognition
-- finished. Same pattern as `projects.eda_completed_at` (migration 0012).
alter table mmm.source_files
  add column if not exists inspection_confirmed_at timestamptz;

-- `datasets.tuning_confirmed_at` — the builder has explicitly confirmed the parameter-
-- tuning step (adstock/saturation/priors per channel, baseline priors, prior-predictive
-- check) before moving on to model specification (sampler settings) and starting a fit.
-- Lets "tuning" and "modelspec" be two distinct, orderable phases instead of one
-- catch-all "configure" step.
alter table mmm.datasets
  add column if not exists tuning_confirmed_at timestamptz;

-- `datasets.tuning_draft` — the confirmed tuning step's model settings (channels with
-- adstock/saturation/priors/calibration, baseline priors, trend/seasonality/likelihood),
-- everything the "tuning" card configures EXCEPT `kpi`/`sources`/`sample`. The
-- "modelspec" step reads this back to assemble the final JobConfig together with the
-- sampler settings it owns, so the two steps can be separate wizard phases without
-- losing the builder's tuning choices in between.
alter table mmm.datasets
  add column if not exists tuning_draft jsonb;

-- No new RLS policies needed: both tables already have builder-only `for all using
-- (mmm.is_builder())` policies (0001_mmm_init.sql) covering these updates.
