-- Zakelijke context per kolom van de definitieve dataset: de bouwer kan per kolom
-- vastleggen wat er zakelijk achter zit ("tv_grps = landelijke campagne, loopt alleen
-- in Q4", "prijs = gemiddelde verkoopprijs incl. acties"). De AI leest deze notities
-- mee in de dataset-context (lib/anthropic/datasetContext.ts) bij elk voorstel.
-- Vorm: { "kolomnaam": "notitie", ... } — alleen kolommen mét een notitie staan erin.
alter table mmm.datasets
  add column if not exists column_notes jsonb;
