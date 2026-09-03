-- Run this SQL once in the external backend to schedule the weekly
-- "Vencimentos próximos 7 dias" report. The job runs frequently and the
-- function respects each user's configured weekday/send_time + last_sent_date.
-- Requires extensions: pg_cron, pg_net (already enabled in this project).

select cron.unschedule('telegram-vencimentos-semana')
where exists (select 1 from cron.job where jobname = 'telegram-vencimentos-semana');

select cron.schedule(
  'telegram-vencimentos-semana',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-vencimentos-semana',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
