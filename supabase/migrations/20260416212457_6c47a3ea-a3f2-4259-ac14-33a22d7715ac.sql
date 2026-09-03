create table public.telegram_pending_edits (
  chat_id bigint primary key,
  expense_id uuid not null,
  user_id uuid not null,
  message_id bigint not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);
alter table public.telegram_pending_edits enable row level security;
create policy "Service role manages pending edits"
  on public.telegram_pending_edits for all
  using (auth.role() = 'service_role');