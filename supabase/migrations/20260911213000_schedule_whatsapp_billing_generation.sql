create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  begin
    perform cron.unschedule('generate-whatsapp-billing-queue');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'generate-whatsapp-billing-queue',
    '*/5 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/send-whatsapp-billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select value from public.app_internal_config where key = 'cron_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $job$
  );
end $$;
