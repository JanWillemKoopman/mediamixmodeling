-- Atomic "publish a run" operation.
--
-- Publishing used to be two separate UPDATE statements from the Next.js route handler
-- (model_runs.is_published, then projects.status) with no transaction tying them
-- together, and no step that un-published a project's previous "champion" run — so a
-- partial failure could leave is_published=true on the run but status='draft' on the
-- project, and republishing a newer run never cleared the older one, leaving more than
-- one run marked is_published=true for the same project.
--
-- SECURITY DEFINER so the function can update both tables in one statement regardless of
-- which RLS policy would otherwise gate each individually; the route handler still checks
-- mmm.is_builder() before calling this, and the function itself re-checks it.
create or replace function mmm.publish_run(p_project_id uuid, p_model_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not mmm.is_builder() then
    raise exception 'only a builder may publish a run';
  end if;

  if not exists (
    select 1 from mmm.model_runs
    where id = p_model_run_id and project_id = p_project_id
  ) then
    raise exception 'model run % does not belong to project %', p_model_run_id, p_project_id;
  end if;

  -- Un-publish any other run of this project first, so at most one run is ever the
  -- published "champion" at a time.
  update mmm.model_runs
    set is_published = false
    where project_id = p_project_id
      and id <> p_model_run_id
      and is_published = true;

  update mmm.model_runs
    set is_published = true, published_at = now()
    where id = p_model_run_id;

  update mmm.projects
    set status = 'published', published_at = now()
    where id = p_project_id;
end;
$$;

grant execute on function mmm.publish_run(uuid, uuid) to authenticated;
