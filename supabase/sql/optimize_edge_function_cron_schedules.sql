-- ============================================================================
-- SQL Script: Otimização dos Agendamentos de Edge Functions (pg_cron)
--
-- 1. process-whatsapp-billing-queue: Mantém execução a cada 10 segundos,
--    porém restrito à janela das 08:50 às 10:00 (Horário de Brasília).
-- 2. telegram-operational-summary e relatórios do Telegram:
--    Ajustados para execução a cada 30 minutos (*/30 * * * *).
-- ============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1. Fila de Cobrança do WhatsApp (10s apenas entre 08:50 e 10:00 BRT)
do $$
begin
  begin
    perform cron.unschedule('process-whatsapp-billing-queue');
  exception when others then null;
  end;

  perform cron.schedule(
    'process-whatsapp-billing-queue',
    '10 seconds',
    $job$
    do $runner$
    declare
      _now_br timestamp with time zone := timezone('America/Sao_Paulo', now());
      _time_br time := _now_br::time;
    begin
      -- Executa a cada 10 segundos estritamente na janela das 08:50:00 às 10:00:00 (Horário de Brasília)
      if _time_br >= '08:50:00'::time and _time_br <= '10:00:00'::time then
        perform net.http_post(
          url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 20000
        );
      end if;
    end $runner$;
    $job$
  );
end $$;

-- 2. Relatórios Operacionais e Sumários do Telegram (A cada 30 minutos)
do $$
begin
  -- 2.1 Resumo Operacional (a cada 30 minutos)
  begin
    perform cron.unschedule('telegram-operational-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-operational-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-operational-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-source', 'pg_cron',
        'x-cron-secret', 'emprestai_cron_internal_secret_2026'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.2 Resumo Diário (a cada 30 minutos)
  begin
    perform cron.unschedule('telegram-daily-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-daily-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.3 Novos Empréstimos (a cada 30 minutos)
  begin
    perform cron.unschedule('telegram-daily-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-daily-loans-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-loans-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.4 Planejamento Diário (a cada 30 minutos)
  begin
    perform cron.unschedule('daily-planning-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'daily-planning-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/daily-planning-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.5 Receitas e Despesas (a cada 30 minutos)
  begin
    perform cron.unschedule('incomes-expenses-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'incomes-expenses-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/incomes-expenses-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.6 Empréstimos em Atraso (a cada 30 minutos)
  begin
    perform cron.unschedule('telegram-overdue-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-overdue-loans-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-overdue-loans-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.7 Empréstimos que Vencem Hoje (a cada 30 minutos)
  begin
    perform cron.unschedule('telegram-due-today-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-due-today-loans-summary',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-due-today-loans-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((select value from public.app_internal_config where key = 'cron_secret' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );

  -- 2.8 Relatório Financeiro Diário (Receitas e Despesas) (a cada 15 minutos)
  begin
    perform cron.unschedule('telegram-daily-financial-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-daily-financial-summary',
    '*/15 * * * *',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-financial-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-source', 'pg_cron',
        'x-cron-secret', 'emprestai_cron_internal_secret_2026'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
end $$;
