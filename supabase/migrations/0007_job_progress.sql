-- Coarse-grained progress phase for 'fit' jobs, so the wizard can show more than a
-- single "running" badge while a fit (which can take minutes) is in flight. Deliberately
-- coarse (not per-MCMC-sample) — the worker updates this between its existing sequential
-- steps in mmm_worker/runner.py, no change to the sampling internals themselves.
alter table mmm.jobs
  add column if not exists progress text
    check (progress is null or progress in (
      'downloading', 'building_dataset', 'sampling', 'saving'
    ));
