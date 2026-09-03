
-- telegram_links: user <-> chat_id
create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  chat_id bigint not null unique,
  created_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;

create policy "Users view own telegram link" on public.telegram_links
  for select to authenticated using (user_id = auth.uid());
create policy "Users delete own telegram link" on public.telegram_links
  for delete to authenticated using (user_id = auth.uid());
create policy "Service role manages telegram_links" on public.telegram_links
  for all using (auth.role() = 'service_role');

-- telegram_link_codes: códigos de 6 dígitos para vincular
create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_link_codes enable row level security;

create policy "Users view own link codes" on public.telegram_link_codes
  for select to authenticated using (user_id = auth.uid());
create policy "Users insert own link codes" on public.telegram_link_codes
  for insert to authenticated with check (user_id = auth.uid());
create policy "Users delete own link codes" on public.telegram_link_codes
  for delete to authenticated using (user_id = auth.uid());
create policy "Service role manages link codes" on public.telegram_link_codes
  for all using (auth.role() = 'service_role');

-- telegram_bot_state: singleton para offset
create table public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.telegram_bot_state (id, update_offset) values (1, 0);
alter table public.telegram_bot_state enable row level security;
create policy "Service role manages bot state" on public.telegram_bot_state
  for all using (auth.role() = 'service_role');

-- telegram_messages: fila de mensagens recebidas
create table public.telegram_messages (
  update_id bigint primary key,
  chat_id bigint not null,
  text text,
  raw_update jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_telegram_messages_unprocessed on public.telegram_messages (created_at) where processed = false;
alter table public.telegram_messages enable row level security;
create policy "Service role manages messages" on public.telegram_messages
  for all using (auth.role() = 'service_role');

-- Enable required extensions for cron
create extension if not exists pg_cron;
create extension if not exists pg_net;
