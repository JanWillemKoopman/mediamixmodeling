-- De kolom die migratie 0022 vergat mee te nemen.
--
-- 0022 herbouwde dataset_versions helemaal, en `preview` (oorspronkelijk uit 0005) viel
-- daarbij weg. Alleen bleef de rest van de keten hem gewoon verwachten: de worker
-- (worker/mmm_worker/prepare.py, mark_ready(..., preview=_preview(...))) schrijft 'm bij elke
-- geslaagde build, en de app (lib/types.ts DatasetVersion.preview, getoond door
-- QualityCard/DatasetPreviewTable in stap 4) leest 'm. Zonder de kolom knalt elke build op de
-- allerlaatste regel: de rij staat al klaar, de worker probeert 'm alleen nog te markeren als
-- "gereed" mét preview, en dat schrijven faalt in zijn geheel — status blijft op 'building'
-- hangen totdat de foutafhandeling 'm alsnog op 'failed' zet.
--
-- Dit kwam pas nu aan het licht: de worker heeft vóór vandaag nog nooit een build afgerond
-- (zie 0025 se aanleiding — de Modal-deploy had nooit gedraaid).

alter table mmm.dataset_versions
  add column if not exists preview jsonb;

comment on column mmm.dataset_versions.preview is
  'Compacte JSON-samenvatting van de gebouwde weektabel (kolommen, kop, staart, per-kolom '
  'statistieken) — geschreven door de worker, getoond in stap 4. Zie lib/types.ts DatasetPreview.';
