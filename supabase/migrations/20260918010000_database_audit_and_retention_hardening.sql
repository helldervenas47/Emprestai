-- ============================================================================
-- Migração: Otimização de Infraestrutura, pg_cron, Logs e Retenção do Banco
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Otimização do Job 115 (WhatsApp Billing Queue)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('process-whatsapp-billing-queue');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'process-whatsapp-billing-queue-window',
      '* 11-13 * * *',
      $job$
      DO $runner$
      DECLARE
        _now_br timestamp with time zone := timezone('America/Sao_Paulo', now());
        _time_br time := _now_br::time;
      BEGIN
        IF _time_br >= '08:50:00'::time AND _time_br <= '10:00:00'::time THEN
          PERFORM net.http_post(
            url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', coalesce(
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
                (SELECT value FROM public.app_internal_config WHERE key = 'cron_secret' LIMIT 1),
                ''
              )
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 45000
          );
        END IF;
      END $runner$;
      $job$
    );
  END IF;
END $$;

-- 2. Desduplicação dos Crons do Asaas (Job 96 / 97)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('asaas-reconcile');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('asaas-reconcile-5min');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'asaas-reconcile-official',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/asaas-reconcile',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            (SELECT value FROM public.app_internal_config WHERE key = 'cron_secret' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $cron$
    );
  END IF;
END $$;

-- 3. Rotina Automática de Retenção Diária
CREATE OR REPLACE FUNCTION public.execute_database_retention_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
DECLARE
  _deleted_cron_logs bigint := 0;
  _deleted_telegram_logs bigint := 0;
  _deleted_webhooks bigint := 0;
  _deleted_cofrinho_audit bigint := 0;
BEGIN
  -- 1. Logs de execução de cron (> 7 dias)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    WITH deleted AS (
      DELETE FROM cron.job_run_details
       WHERE end_time < now() - INTERVAL '7 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_cron_logs FROM deleted;
  END IF;

  -- 2. Logs do Telegram (> 15 dias)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_job_logs') THEN
    WITH deleted AS (
      DELETE FROM public.telegram_job_logs
       WHERE created_at < now() - INTERVAL '15 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_telegram_logs FROM deleted;
  END IF;

  -- 3. Webhooks do Asaas antigos (> 90 dias) preservando idempotência
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'asaas_webhook_events') THEN
    WITH deleted AS (
      DELETE FROM public.asaas_webhook_events
       WHERE created_at < now() - INTERVAL '90 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_webhooks FROM deleted;
  END IF;

  -- 4. Auditoria do cofrinho antiga (> 180 dias) (O cofrinho_ledger nunca é expurgado)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
    WITH deleted AS (
      DELETE FROM public.auditoria_cofrinho
       WHERE created_at < now() - INTERVAL '180 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_cofrinho_audit FROM deleted;
  END IF;

  RETURN jsonb_build_object(
    'executed_at', now(),
    'deleted_cron_job_runs', _deleted_cron_logs,
    'deleted_telegram_logs', _deleted_telegram_logs,
    'deleted_asaas_webhooks', _deleted_webhooks,
    'deleted_cofrinho_audits', _deleted_cofrinho_audit
  );
END;
$$;

-- Agendamento diário da manutenção
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('database-retention-maintenance-daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'database-retention-maintenance-daily',
      '30 3 * * *',
      $cron$
      SELECT public.execute_database_retention_maintenance();
      $cron$
    );
  END IF;
END $$;

-- 4. View de monitoramento de armazenamento
CREATE OR REPLACE VIEW public.admin_database_storage_stats AS
SELECT
  nspname AS schema_name,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size,
  pg_size_pretty(pg_relation_size(C.oid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(C.oid) - pg_relation_size(C.oid)) AS index_size,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  round((n_dead_tup::numeric / greatest(n_live_tup + n_dead_tup, 1)::numeric) * 100, 2) AS dead_rows_pct,
  last_vacuum,
  last_autovacuum
FROM pg_class C
LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
LEFT JOIN pg_stat_user_tables S ON (S.relid = C.oid)
WHERE C.relkind = 'r'
  AND nspname IN ('public', 'cron', 'vault')
ORDER BY pg_total_relation_size(C.oid) DESC;
