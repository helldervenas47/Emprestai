-- Rodar no SQL editor do SUPABASE EXTERNO (syyxnqzxqabeuqbuptkh).
-- Recria os cron jobs apontando para as functions agora hospedadas no externo.
--
-- ⚠️ ANTES DE RODAR: substitua <ANON_KEY_DO_EXTERNO> pela publishable/anon key
-- do projeto externo (Project Settings → API Keys → anon key).
-- A chamada precisa do header Authorization Bearer para passar pelo verify_jwt
-- do gateway de edge functions.

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Limpa eventuais agendamentos duplicados antes de recriar
DO $$
DECLARE
  job_name TEXT;
  jobs TEXT[] := ARRAY[
    'telegram-daily-summary',
    'telegram-weekly-summary',
    'telegram-monthly-summary',
    'telegram-billing-summary',
    'telegram-accumulated-delinquency-summary',
    'telegram-manager-weekly-summary',
    'incomes-expenses-summary',
    'daily-planning-summary',
    'send-personal-insights-telegram',
    'telegram-poll',
    'telegram-reports-poll'
  ];
BEGIN
  FOREACH job_name IN ARRAY jobs LOOP
    BEGIN PERFORM cron.unschedule(job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- Helper macro: cada função roda a cada minuto; ajuste o schedule se quiser.
-- (Mantive os mesmos schedules que estavam no Cloud — '* * * * *'.)

SELECT cron.schedule('telegram-daily-summary', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-weekly-summary', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-weekly-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-monthly-summary', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-monthly-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-billing-summary', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-billing-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-accumulated-delinquency-summary', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-accumulated-delinquency-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-manager-weekly-summary', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-manager-weekly-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('incomes-expenses-summary', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/incomes-expenses-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('daily-planning-summary', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/daily-planning-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('send-personal-insights-telegram', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/send-personal-insights-telegram',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-poll', '*/2 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

SELECT cron.schedule('telegram-reports-poll', '*/2 * * * *', $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-reports-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY_DO_EXTERNO>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$$);

-- Conferência
SELECT jobid, jobname, schedule
FROM cron.job
ORDER BY jobname;
