-- Het stappen-grootboek: wat de gebruiker heeft besloten, en wanneer.
--
-- Zie docs/CHAT_PIPELINE_HERZIENING.md. De wizard leidde zijn fase volledig af uit de data
-- (bronnen, dataset, runs). Dat is goed en blijft zo — maar het antwoordt op "waar sta je",
-- niet op "wat heb je besloten". Daardoor kon de voortgangsbalk een vinkje zetten bij een
-- stap die de gebruiker nooit gezien heeft, en was er nergens vast te stellen dat een
-- eerdere keuze door een latere wijziging achterhaald was.
--
-- Deze tabel voegt precies dat toe, en niets meer. Twee dingen die er BEWUST niet in staan:
--
--   * Geen `status`-kolom. Dat zou een tweede waarheid zijn naast de afgeleide toestand,
--     en 0022 heeft juist zo'n dubbele waarheid weggehaald (jobs.status naast
--     datasets.status, die uit elkaar konden lopen). De status wordt altijd berekend uit
--     de feiten plus dit grootboek — zie lib/flow/state.ts.
--   * Geen `stale`-vlag. Veroudering volgt uit de tijden: een beslissing is achterhaald
--     zodra een stap waarvan hij afhangt láter is beslist. Dat vraagt geen bijwerkcascade
--     die kan mislukken of achterlopen, en kan dus ook niet uit de pas gaan lopen.
--
-- Eén rij per (project, stap): een stap opnieuw doorlopen overschrijft zijn beslissing en
-- schuift `decided_at` naar voren, waarmee alles wat ervan afhangt vanzelf als achterhaald
-- zichtbaar wordt.

create table if not exists mmm.project_steps (
  project_id  uuid        not null references mmm.projects (id) on delete cascade,
  -- De stap-id uit lib/flow/steps.ts. Bewust tekst en geen enum: een stap toevoegen of
  -- hernoemen is een applicatiewijziging, geen migratie. De TypeScript-kant is de
  -- autoriteit over welke ids bestaan; onbekende ids worden bij het lezen genegeerd.
  step        text        not null,
  -- Wat er in deze stap is besloten, in de vorm die de stap zelf definieert (het doel van
  -- het project, de bevestigde kolomrollen, de gekozen verwachtingen per kanaal). Dit is
  -- de enige plek waar een beslissing woont die géén eigen tabel heeft.
  decision    jsonb       not null default '{}'::jsonb,
  -- Eén regel mensentaal voor de stappenbalk ("KPI: totale_omzet, 9 kanalen"). Hier
  -- opgeslagen en niet elke keer opnieuw afgeleid, zodat de balk kan tonen wat er tóen is
  -- besloten, ook nadat de onderliggende data is gewijzigd.
  summary     text,
  decided_at  timestamptz not null default now(),
  decided_by  uuid        references auth.users (id),
  primary key (project_id, step)
);

-- De stappenbalk leest alle stappen van één project ineens.
create index if not exists project_steps_project_idx on mmm.project_steps (project_id);

alter table mmm.project_steps enable row level security;

-- Zelfde isolatie als de rest van het bouwersdeel: de klant ziet dit nooit. Geen policy
-- voor de klantrol betekent geen toegang.
create policy project_steps_builder_all on mmm.project_steps
  for all to authenticated
  using (mmm.is_builder()) with check (mmm.is_builder());

grant select, insert, update, delete on mmm.project_steps to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Het transcript: berichten worden verankerd aan een stap en krijgen een soort
--
-- Het gesprek was tot nu toe client-state en verdween bij elke page load; de route die de
-- historie teruggaf (GET /api/chat) werd nergens aangeroepen. Het transcript wordt nu
-- server-side gerenderd uit deze tabel, en moet daarvoor méér kunnen dragen dan alleen
-- Anthropic-contentblokken: ook de vaste gidsteksten, de genomen beslissingen en de
-- uitkomstkaarten horen in het verhaal thuis.
-- ---------------------------------------------------------------------------
alter table mmm.chat_messages
  add column if not exists step text,
  add column if not exists kind text;

-- Bestaande rijen zijn vrije-tekst-gesprekken met de architect: die blijven staan en
-- blijven leesbaar. Ze verliezen niets — ze weten alleen niet bij welke stap ze hoorden,
-- want dat is nooit vastgelegd.
update mmm.chat_messages set kind = 'chat' where kind is null;

alter table mmm.chat_messages
  alter column kind set default 'chat',
  alter column kind set not null;

-- 'chat'     — vrij gesprek met de gids (content = Anthropic-contentblokken)
-- 'guide'    — een vaste, vooraf geschreven begeleidende tekst (0 tokens)
-- 'decision' — wat de gebruiker in een stap heeft gekozen
-- 'result'   — een uitkomstkaart (verwijst naar een run; de cijfers zelf blijven in
--              model_results, zodat het transcript nooit een tweede kopie van een cijfer
--              bevat die kan afwijken van het oordeel dat erbij hoort)
alter table mmm.chat_messages
  drop constraint if exists chat_messages_kind_check;
alter table mmm.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('chat', 'guide', 'decision', 'result'));

-- Het transcript wordt per project op volgorde gelezen; de index uit 0004 dekt dat al.
-- Deze erbij voor "wat is er in stap X gebeurd", dat de stapkaart nodig heeft.
create index if not exists chat_messages_project_step_idx
  on mmm.chat_messages (project_id, step, created_at);
