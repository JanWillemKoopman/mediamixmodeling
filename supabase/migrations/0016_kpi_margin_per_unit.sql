-- kpi_margin verandert van betekenis: geen fractie (0–1) meer, maar een EUROBEDRAG —
-- de gemiddelde brutomarge per verkochte KPI-eenheid (bv. €12,50 per order; bij een
-- omzet-KPI: winst per euro omzet, bv. 0,35). Dat is hoe bedrijven denken ("wat houd
-- ik over aan één verkoop?") — een percentage bleek te ingewikkeld. In te vullen in
-- het zakelijke-contextpaneel, of automatisch overgenomen als gemiddelde van een
-- marge-kolom in de brondata (rol "Marge" in stap 2).
alter table mmm.projects drop constraint if exists projects_kpi_margin_check;
alter table mmm.projects add constraint projects_kpi_margin_check check (kpi_margin > 0);
