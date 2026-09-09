-- Opruimen na 0022. Vijf projecten stonden op 'published', maar hun resultaten zaten in de
-- gedropte v1-tabellen en bestaan niet meer. Een gepubliceerd project zonder resultaat is
-- een bewering die nergens meer op rust: het klantdashboard zou een leeg of half scherm
-- tonen voor een project dat zegt klaar te zijn. Terug naar 'draft' — het model moet
-- opnieuw gedraaid en opnieuw beoordeeld worden voordat er weer iets naar een klant gaat.
update mmm.projects p
   set status = 'draft',
       published_at = null
 where p.status = 'published'
   and not exists (
     select 1 from mmm.model_results r
      where r.project_id = p.id and r.is_published
   );
