-- mmm.data_inspections kreeg in 0018 een 'running'-status zodat de client de voortgang kon
-- volgen "via poll/realtime" — maar de tabel werd nooit aan de realtime-publicatie
-- toegevoegd. Zonder dit ontvangt de wizard geen enkel signaal wanneer een diepe
-- data-inspectie (een minutenlange achtergrondtaak, app/api/inspect/route.ts) klaar is; een
-- client-side timer alleen is niet genoeg (overleeft geen achtergrondgezette mobiele tab),
-- dus de uitkomst leek dan voor de bouwer nooit te komen terwijl de server allang klaar was.
alter publication supabase_realtime add table mmm.data_inspections;
