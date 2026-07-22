-- Harden the mmm RLS policies: restrict them to the `authenticated` role so the `anon`
-- role is excluded at the role level (defence in depth — the USING clauses already deny
-- anonymous users, this makes the intent explicit and silences the anon-access advisor).
-- The Modal worker uses the service_role key, which bypasses RLS regardless.

alter policy app_users_self_read       on mmm.app_users      to authenticated;
alter policy app_users_builder_write    on mmm.app_users      to authenticated;
alter policy projects_builder_all       on mmm.projects       to authenticated;
alter policy projects_client_read       on mmm.projects       to authenticated;
alter policy project_access_builder_all on mmm.project_access to authenticated;
alter policy project_access_self_read   on mmm.project_access to authenticated;
alter policy source_files_builder_all   on mmm.source_files   to authenticated;
alter policy jobs_builder_all           on mmm.jobs           to authenticated;
alter policy model_runs_builder_all     on mmm.model_runs     to authenticated;
alter policy model_runs_client_read     on mmm.model_runs     to authenticated;

alter policy mmm_raw_builder_all        on storage.objects    to authenticated;
alter policy mmm_artifacts_builder_all  on storage.objects    to authenticated;
