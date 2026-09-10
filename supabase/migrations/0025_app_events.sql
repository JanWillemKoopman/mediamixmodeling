-- Het logboek: wat de gebruiker deed, en wat er misging.
--
-- Waarom een tabel en niet console.log? Omdat de plek waar het misgaat zelden de plek is
-- waar je kijkt. Een fout in de browser staat in de browserconsole, een fout in een API-route
-- in de Vercel-logs, en een fout in de worker in Modal — drie schermen, drie inlogs, en geen
-- van drieën vertelt WAT de gebruiker net had aangeklikt. Deze tabel is de vierde plek die
-- alle drie samenbrengt op één tijdlijn, per testsessie, zodat "het ging mis bij stap 4" een
-- vraag is die te beantwoorden valt zonder erbij te hebben gezeten.
--
-- Bewust geen foreign keys op project_id/user_id. Een logregel moet ook geschreven kunnen
-- worden als die verwijzing nergens naar wijst — juist een verkeerd project-id is een bug die
-- we willen zien, en een FK zou het loggen ervan laten mislukken. Loggen mag nooit zelf de
-- fout worden.

create table if not exists mmm.app_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  -- Eén testsessie = één browsertabblad. Hiermee lees je de handelingen van de gebruiker
  -- terug in de volgorde waarin hij ze deed, zonder ze uit elkaar te hoeven pluizen als er
  -- tegelijk iemand anders test.
  session_id  text        not null,
  -- 'client' = in de browser gebeurd, 'server' = in een API-route. De worker (Modal) logt
  -- zijn eigen fouten in jobs.error; die blijft waar hij is.
  source      text        not null check (source in ('client', 'server')),
  level       text        not null check (level in ('info', 'warn', 'error')),
  -- Wat voor gebeurtenis: 'pageview', 'flow.action', 'api.request', 'api.error',
  -- 'window.error', 'render.error'. Vrije tekst en geen enum: een gebeurtenis toevoegen is
  -- een applicatiewijziging, geen migratie.
  event       text        not null,
  -- Eén regel mensentaal. Bij een fout: de echte, onvertaalde melding — niet de nette
  -- Nederlandse tekst die de gebruiker zag, want die is juist ontworpen om details weg te
  -- laten.
  message     text,
  project_id  uuid,
  user_id     uuid,
  -- De pagina (client) of de route (server) waar dit gebeurde.
  path        text,
  -- Alles wat verder helpt: de aangeklikte actie, de HTTP-status, de duur in ms, de
  -- stacktrace. Vormvrij, want elke gebeurtenis draagt iets anders.
  detail      jsonb       not null default '{}'::jsonb
);

-- Het logboek wordt bijna altijd gelezen als "de laatste N", of als "deze sessie op
-- volgorde", of als "alleen de fouten".
create index if not exists app_events_at_idx on mmm.app_events (at desc);
create index if not exists app_events_session_idx on mmm.app_events (session_id, at);
create index if not exists app_events_errors_idx on mmm.app_events (at desc) where level = 'error';

alter table mmm.app_events enable row level security;

-- Een brievenbus: iedereen mag erin schrijven, alleen de bouwer mag hem legen en lezen.
-- Schrijven moet ook kunnen zónder ingelogd te zijn, anders mist het logboek precies de
-- fouten op de inlogpagina — de plek waar een testsessie het vaakst stukloopt.
create policy app_events_anyone_insert on mmm.app_events
  for insert to anon, authenticated with check (true);

create policy app_events_builder_read on mmm.app_events
  for select to authenticated using (mmm.is_builder());

create policy app_events_builder_delete on mmm.app_events
  for delete to authenticated using (mmm.is_builder());

-- Identity-kolommen hebben geen aparte sequence-grant nodig; insert-recht volstaat.
grant select, insert, delete on mmm.app_events to anon, authenticated, service_role;
