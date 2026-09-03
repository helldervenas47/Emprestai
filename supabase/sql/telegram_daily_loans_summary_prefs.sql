-- Preferências de envio automático do "Resumo do dia" (empréstimos) via bot de relatórios.
-- Estrutura idêntica aos demais prefs (até 3 horários por dia + last_sent).
-- Executar UMA vez no Supabase externo (syyxnqzxqabeuqbuptkh).

create table if not exists public.telegram_daily_loans_summary_prefs (
  user_id uuid primary key,
  enabled boolean not null default false,
  send_time_1 text default '19:00',
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.telegram_daily_loans_summary_prefs to authenticated;
grant all on public.telegram_daily_loans_summary_prefs to service_role;
alter table public.telegram_daily_loans_summary_prefs enable row level security;

drop policy if exists "users manage own daily loans summary prefs" on public.telegram_daily_loans_summary_prefs;
create policy "users manage own daily loans summary prefs"
on public.telegram_daily_loans_summary_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Cron: roda a cada 15 minutos (respeita last_sent + horários configurados).
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('telegram-daily-loans-summary'); EXCEPTION WHEN others THEN NULL; END $$;

SELECT cron.schedule(
  'telegram-daily-loans-summary',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-loans-summary',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  ); $$
);
