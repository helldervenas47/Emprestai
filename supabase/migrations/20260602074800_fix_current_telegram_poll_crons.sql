CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-poll');
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-reports-poll');
EXCEPTION WHEN others THEN
  NULL;
END $$;

SELECT cron.schedule(
  'telegram-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-poll',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);

SELECT cron.schedule(
  'telegram-reports-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-reports-poll',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
