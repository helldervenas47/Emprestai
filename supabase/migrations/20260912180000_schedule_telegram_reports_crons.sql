-- Migration para garantir o agendamento correto de todas as Edge Functions de relatórios do Telegram
-- Projeto oficial: syyxnqzxqabeuqbuptkh

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Garante tabela de configuração interna e chave do cron
create table if not exists public.app_internal_config (
  key text primary key,
  value text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

grant select, insert, update on public.app_internal_config to authenticated;
grant all on public.app_internal_config to service_role;

-- Garante que exista um cron_secret para autenticar as chamadas das edge functions
insert into public.app_internal_config (key, value, description)
values ('cron_secret', encode(gen_random_bytes(32), 'hex'), 'Segredo compartilhado para chamadas automáticas do pg_cron')
on conflict (key) do nothing;

do $$
begin
  -- 1. Resumo Operacional (a cada 10 minutos)
  begin
    perform cron.unschedule('telegram-operational-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-operational-summary',
    '*/10 * * * *',
    $job$
    select net.http_post(
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

  -- 2. Resumo Diário (a cada 10 minutos)
  begin
    perform cron.unschedule('telegram-daily-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-daily-summary',
    '*/10 * * * *',
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

  -- 3. Resumo de Novos Empréstimos / Movimentações (a cada 10 minutos)
  begin
    perform cron.unschedule('telegram-daily-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-daily-loans-summary',
    '*/10 * * * *',
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

  -- 4. Planejamento Diário (a cada 10 minutos)
  begin
    perform cron.unschedule('daily-planning-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'daily-planning-summary',
    '*/10 * * * *',
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

  -- 5. Receitas e Despesas (a cada 10 minutos)
  begin
    perform cron.unschedule('incomes-expenses-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'incomes-expenses-summary',
    '*/10 * * * *',
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

  -- 6. Empréstimos em Atraso (a cada 10 minutos)
  begin
    perform cron.unschedule('telegram-overdue-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-overdue-loans-summary',
    '*/10 * * * *',
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

  -- 7. Vencem Hoje (a cada 10 minutos)
  begin
    perform cron.unschedule('telegram-due-today-loans-summary');
  exception when others then null;
  end;

  perform cron.schedule(
    'telegram-due-today-loans-summary',
    '*/10 * * * *',
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

end $$;
