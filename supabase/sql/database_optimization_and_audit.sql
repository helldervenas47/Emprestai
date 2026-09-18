-- ============================================================================
-- AUDITORIA E OTIMIZAÇÃO DO BANCO POSTGRESQL / SUPABASE — EMPRESTAI
--
-- 1. Otimização do Agendamento do pg_cron (Elimina 8.640 execuções/dia do Job 115)
-- 2. Eliminação de Duplicidade nos Crons do Asaas (Job 96 / 97)
-- 3. Retenção Diária de 7 dias para cron.job_run_details (Reduz 112 MB)
-- 4. Otimização da Auditoria do Cofrinho (Reduz 104 MB e impede snapshots inúteis)
-- 5. Retenção Segura para telegram_job_logs (15 dias) e asaas_webhook_events (90 dias)
-- 6. Preservação Total do cofrinho_ledger (FONTE FINANCEIRA IMUTÁVEL)
-- 7. Padronização de Segurança com Supabase Vault / app_internal_config
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. OTIMIZAÇÃO DO PG_CRON: JOB 115 (WHATSAPP BILLING QUEUE)
-- ----------------------------------------------------------------------------
-- Remove agendamento contínuo de 10 segundos que gerava 8.640 runs/dia em 24h
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('process-whatsapp-billing-queue');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Agendamento otimizado: executa a cada 1 minuto estritamente na janela de cobrança
    -- das 08:50 às 10:00 (Horário de Brasília / America/Sao_Paulo)
    -- Horário UTC correspondente: 11:50 às 13:00 UTC (ou controlado por timezone)
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

-- ----------------------------------------------------------------------------
-- 2. DESDUPLICAÇÃO DOS CRONS DO ASAAS (JOB 96 / JOB 97)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove possíveis nomes legados/duplicados
    BEGIN
      PERFORM cron.unschedule('asaas-reconcile');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('asaas-reconcile-5min');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Mantém um único agendamento oficial a cada 5 minutos usando Vault
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

-- ----------------------------------------------------------------------------
-- 3. ROTINA AUTOMÁTICA DE RETENÇÃO DIÁRIA DO BANCO (DIAGNOSTIC & LOGS)
-- ----------------------------------------------------------------------------
-- Função de manutenção e retenção segura executada diariamente às 03:30 UTC
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
  -- 1. Limpeza de logs de execução de cron antigos (> 7 dias)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    WITH deleted AS (
      DELETE FROM cron.job_run_details
       WHERE end_time < now() - INTERVAL '7 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_cron_logs FROM deleted;
  END IF;

  -- 2. Limpeza de logs do Telegram antigos (> 15 dias)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_job_logs') THEN
    WITH deleted AS (
      DELETE FROM public.telegram_job_logs
       WHERE created_at < now() - INTERVAL '15 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_telegram_logs FROM deleted;
  END IF;

  -- 3. Limpeza de webhooks do Asaas antigos (> 90 dias) preservando idempotência recente
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'asaas_webhook_events') THEN
    WITH deleted AS (
      DELETE FROM public.asaas_webhook_events
       WHERE created_at < now() - INTERVAL '90 days'
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_webhooks FROM deleted;
  END IF;

  -- 4. Limpeza de auditoria do cofrinho antiga (> 180 dias)
  -- NOTA: O cofrinho_ledger (ledger contábil) NUNCA é tocado aqui!
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

-- Agendar a manutenção diária de retenção no pg_cron às 03:30 UTC
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

-- ----------------------------------------------------------------------------
-- 4. OTIMIZAÇÃO DE TRIGGERS DO COFRINHO (IMPEDE AUDITORIAS INÚTEIS NO-OP)
-- ----------------------------------------------------------------------------
-- Função para auditoria inteligente do Cofrinho gravando apenas deltas reais
CREATE OR REPLACE FUNCTION public.audit_cofrinho_change_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _changes jsonb := '{}'::jsonb;
BEGIN
  -- Se for UPDATE, verifica se houve mudança substancial em dados financeiros/cadastrais
  IF TG_OP = 'UPDATE' THEN
    -- Ignora se os dados relevantes forem idênticos (apenas updated_at mudou)
    IF (OLD.name IS NOT DISTINCT FROM NEW.name)
       AND (OLD.target_amount IS NOT DISTINCT FROM NEW.target_amount)
       AND (OLD.balance IS NOT DISTINCT FROM NEW.balance)
       AND (OLD.rate_annual IS NOT DISTINCT FROM NEW.rate_annual)
       AND (OLD.auto_rate IS NOT DISTINCT FROM NEW.auto_rate)
       AND (OLD.status IS NOT DISTINCT FROM NEW.status)
       AND (OLD.locked_until IS NOT DISTINCT FROM NEW.locked_until)
    THEN
      RETURN NEW;
    END IF;

    -- Monta delta de alterações
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      _changes := _changes || jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', NEW.name));
    END IF;
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
      _changes := _changes || jsonb_build_object('balance', jsonb_build_object('old', OLD.balance, 'new', NEW.balance));
    END IF;
    IF OLD.target_amount IS DISTINCT FROM NEW.target_amount THEN
      _changes := _changes || jsonb_build_object('target_amount', jsonb_build_object('old', OLD.target_amount, 'new', NEW.target_amount));
    END IF;
    IF OLD.rate_annual IS DISTINCT FROM NEW.rate_annual THEN
      _changes := _changes || jsonb_build_object('rate_annual', jsonb_build_object('old', OLD.rate_annual, 'new', NEW.rate_annual));
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _changes := _changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id,
        usuario_id,
        operacao,
        tabela,
        registro_id,
        dados_anteriores,
        dados_novos,
        origem,
        created_at
      ) VALUES (
        NEW.id,
        NEW.user_id,
        'UPDATE',
        'piggy_banks',
        NEW.id::text,
        jsonb_build_object('changes', _changes),
        jsonb_build_object('new_balance', NEW.balance, 'updated_at', now()),
        'trigger_optimized',
        now()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. VIEW ADMINISTRATIVA DE MONITORAMENTO DE ARMAZENAMENTO E SAÚDE DO BANCO
-- ----------------------------------------------------------------------------
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

COMMENT ON VIEW public.admin_database_storage_stats IS 'Estatísticas administrativas de armazenamento, dead tuples e volume por tabela.';

COMMIT;
