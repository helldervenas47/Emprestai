-- Execute UMA vez no SQL Editor do projeto EXTERNO (syyxnqzxqabeuqbuptkh),
-- pois é nele que o pg_cron + pg_net estão instalados e onde ficam os dados
-- dos relatórios. As funções de borda, porém, vivem no projeto Lovable Cloud
-- (lcjelojqxpnphupsnmuq) — por isso as URLs abaixo apontam para lá.
-- Os jobs rodam a cada minuto; as funções usam last_sent para impedir duplicidade.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  job_name text;
  names text[] := ARRAY[
    'telegram-daily-summary',
    'telegram-weekly-summary',
    'telegram-monthly-summary',
    'telegram-billing-summary',
    'telegram-accumulated-delinquency-summary',
    'telegram-manager-weekly-summary',
    'incomes-expenses-summary',
    'daily-planning-summary',
    'send-personal-insights-telegram'
  ];
BEGIN
  FOREACH job_name IN ARRAY names LOOP
    BEGIN PERFORM cron.unschedule(job_name); EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;

SELECT cron.schedule('telegram-daily-summary', '*/5 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-daily-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-weekly-summary', '*/5 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-weekly-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-monthly-summary', '*/10 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-monthly-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-billing-summary', '*/10 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-billing-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-accumulated-delinquency-summary', '*/15 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-accumulated-delinquency-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('telegram-manager-weekly-summary', '*/15 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-manager-weekly-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('incomes-expenses-summary', '*/10 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/incomes-expenses-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('daily-planning-summary', '*/5 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/daily-planning-summary', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);
SELECT cron.schedule('send-personal-insights-telegram', '*/5 * * * *', $$ SELECT net.http_post(url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/send-personal-insights-telegram', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 45000); $$);

-- Verificar depois:
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- SELECT jobid, status, return_message, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
