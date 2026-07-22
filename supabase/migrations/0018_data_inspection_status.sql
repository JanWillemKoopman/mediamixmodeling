-- De diepe data-inspectie (/api/inspect) draaide tot nu toe als ÉÉN blokkerende
-- HTTP-aanvraag die kon oplopen tot enkele minuten (meerdere Claude/code_execution-rondes
-- over de volledige reeks). Op mobiel netwerk valt zo'n lang openstaande verbinding regelmatig
-- weg (wisselend signaal, achtergrondgrendel), wat de gebruiker als "Geen verbinding met de
-- server" te zien kreeg — ook als de server prima aan het werk was.
--
-- Fix: de rij wordt nu meteen als 'running' aangemaakt en de POST antwoordt meteen; de client
-- volgt de voortgang via deze status-kolom (poll/realtime) in plaats van op de aanvraag te
-- blijven wachten.
alter table mmm.data_inspections
  add column if not exists status text not null default 'done' check (status in ('running', 'done', 'error'));

-- Bestaande rijen zijn altijd al afgeronde inspecties (de kolom bestond niet toen ze
-- werden geschreven) — expliciet zodat een toekomstige default-wijziging dit niet stilzwijgend
-- meesleept.
update mmm.data_inspections set status = case when error is not null then 'error' else 'done' end;
