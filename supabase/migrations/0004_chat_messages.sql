-- Chat history for the builder-facing "architect" chat panel (Claude Sonnet 5).
-- Builder-only, same isolation pattern as the rest of the mmm schema. Clients never
-- see this table -- no RLS policy grants them access, which means no access at all.

create table if not exists mmm.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references mmm.projects (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     jsonb not null,     -- raw Anthropic content-block array (text/tool_use/tool_result)
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_project_idx on mmm.chat_messages (project_id, created_at);

alter table mmm.chat_messages enable row level security;

create policy chat_messages_builder_all on mmm.chat_messages
  for all to authenticated
  using (mmm.is_builder()) with check (mmm.is_builder());

grant select, insert, update, delete on mmm.chat_messages to anon, authenticated, service_role;
