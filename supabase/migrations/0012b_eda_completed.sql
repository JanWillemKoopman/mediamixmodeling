-- Lets the builder explicitly mark the EDA step as finished, so the pipeline stepper can
-- show it "done" (green check) like every other step. EDA has no natural completion
-- signal of its own (no approve/publish action) — it's a client-side exploration detour —
-- so without this flag it can only ever be "active"/"available", never "done".
alter table mmm.projects
  add column if not exists eda_completed_at timestamptz;

-- No new RLS policy needed: mmm.projects already has `projects_builder_all` (`for all
-- using (mmm.is_builder())`), which covers this update.
