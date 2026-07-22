-- Widen the job queue's `type` check to allow a hierarchical/multi-region fit
-- ('fit_hierarchical'), dispatched by mmm_worker.modal_app to run_hier_job() instead of
-- the single-region run_job(). Mirrors how 0005_datasets.sql added 'prepare'.
alter table mmm.jobs drop constraint if exists jobs_type_check;
alter table mmm.jobs add constraint jobs_type_check check (type in ('fit', 'prepare', 'fit_hierarchical'));
