-- Preferências de envio automático do "Resumo Operacional" via bot de relatórios do Telegram.
-- Estrutura para até 3 horários por dia + controle de último envio.

create table if not exists public.telegram_operational_summary_prefs (
  user_id uuid primary key,
  enabled boolean not null default false,
  send_whatsapp boolean not null default false,
  whatsapp_phone text,
  send_time_1 text default '19:00',
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.telegram_operational_summary_prefs add column if not exists send_whatsapp boolean not null default false;
alter table public.telegram_operational_summary_prefs add column if not exists whatsapp_phone text;

grant select, insert, update, delete on public.telegram_operational_summary_prefs to authenticated;
grant all on public.telegram_operational_summary_prefs to service_role;
alter table public.telegram_operational_summary_prefs enable row level security;

drop policy if exists "users manage own operational summary prefs" on public.telegram_operational_summary_prefs;
create policy "users manage own operational summary prefs"
on public.telegram_operational_summary_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Cron: roda a cada 1 minuto (respeita last_sent + horários configurados no minuto exato).
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('telegram-operational-summary'); EXCEPTION WHEN others THEN NULL; END $$;

SELECT cron.schedule(
  'telegram-operational-summary',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-operational-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

