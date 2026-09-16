-- Tabela de preferências de agendamento do Relatório Financeiro Diário via Telegram
create table if not exists public.telegram_daily_financial_summary_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  send_time_1 text default '19:00',
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

grant select, insert, update, delete on public.telegram_daily_financial_summary_prefs to authenticated;
grant all on public.telegram_daily_financial_summary_prefs to service_role;
alter table public.telegram_daily_financial_summary_prefs enable row level security;

drop policy if exists "users manage own daily financial summary prefs"
on public.telegram_daily_financial_summary_prefs;

create policy "users manage own daily financial summary prefs"
on public.telegram_daily_financial_summary_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
