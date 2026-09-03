-- Execute UMA vez no Supabase EXTERNO (syyxnqzxqabeuqbuptkh).
-- Cria as preferências por usuário para os dois novos relatórios
-- "Empréstimos em atraso" e "Contratos que vencem hoje", com até 3
-- horários de envio automático cada (igual ao Planejamento do dia).

create table if not exists public.telegram_overdue_loans_prefs (
  user_id uuid primary key,
  enabled boolean not null default false,
  send_time_1 text default '09:00',
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.telegram_overdue_loans_prefs to authenticated;
grant all on public.telegram_overdue_loans_prefs to service_role;
alter table public.telegram_overdue_loans_prefs enable row level security;

drop policy if exists "users manage own overdue prefs" on public.telegram_overdue_loans_prefs;
create policy "users manage own overdue prefs"
on public.telegram_overdue_loans_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.telegram_due_today_loans_prefs (
  user_id uuid primary key,
  enabled boolean not null default false,
  send_time_1 text default '08:00',
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.telegram_due_today_loans_prefs to authenticated;
grant all on public.telegram_due_today_loans_prefs to service_role;
alter table public.telegram_due_today_loans_prefs enable row level security;

drop policy if exists "users manage own due-today prefs" on public.telegram_due_today_loans_prefs;
create policy "users manage own due-today prefs"
on public.telegram_due_today_loans_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Agendar os crons (rodam a cada minuto e respeitam last_sent).
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('telegram-overdue-loans-summary'); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('telegram-due-today-loans-summary'); EXCEPTION WHEN others THEN NULL; END $$;

SELECT cron.schedule('telegram-overdue-loans-summary', '*/15 * * * *', $$ SELECT net.http_post(url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-overdue-loans-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-due-today-loans-summary', '*/15 * * * *', $$ SELECT net.http_post(url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-due-today-loans-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
