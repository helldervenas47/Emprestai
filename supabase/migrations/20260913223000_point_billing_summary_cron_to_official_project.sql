-- O resumo manual usa o projeto oficial, mas um agendamento legado ainda
-- chamava a cópia da função no antigo projeto Lovable Cloud. Isso fazia o
-- relatório automático usar um cálculo de juros desatualizado.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  begin
    perform cron.unschedule('telegram-billing-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-billing-summary',
    '*/10 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-billing-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-source', 'pg_cron'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
end $$;
