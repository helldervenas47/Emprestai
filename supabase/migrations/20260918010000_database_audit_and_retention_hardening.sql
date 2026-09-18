-- ============================================================================
-- Migração: Otimização de Infraestrutura, pg_cron, Logs e Auditoria DIFF do Cofrinho
-- Arquivo: supabase/migrations/20260918010000_database_audit_and_retention_hardening.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ----------------------------------------------------------------------------
-- 1. Otimização do Job WhatsApp (Schedules Exatos: 08:50 a 10:00 BRT / UTC-3)
-- ----------------------------------------------------------------------------
-- BRT = UTC-3. Janela 08:50 às 10:00 BRT corresponde exatamente a:
--   - 11:50 às 11:59 UTC (10 minutos) -> 50-59 11 * * *
--   - 12:00 às 12:59 UTC (60 minutos) -> * 12 * * *
--   - 13:00 UTC (1 minuto)            -> 0 13 * * *
-- Total exato: 71 disparos/dia (0 minutos ociosos).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('process-whatsapp-billing-queue'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('process-whatsapp-billing-queue-window'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-1'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-2'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-3'); EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Job Janela 1: 11:50 a 11:59 UTC (08:50 a 08:59 BRT) = 10 execuções
    PERFORM cron.schedule(
      'whatsapp-billing-window-1',
      '50-59 11 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            (SELECT value FROM public.app_internal_config WHERE key = 'cron_secret' LIMIT 1),
            ''
          )
        ),
        body := '{"trigger": "cron_window_1"}'::jsonb,
        timeout_milliseconds := 45000
      );
      $cron$
    );

    -- Job Janela 2: 12:00 a 12:59 UTC (09:00 a 09:59 BRT) = 60 execuções
    PERFORM cron.schedule(
      'whatsapp-billing-window-2',
      '* 12 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            (SELECT value FROM public.app_internal_config WHERE key = 'cron_secret' LIMIT 1),
            ''
          )
        ),
        body := '{"trigger": "cron_window_2"}'::jsonb,
        timeout_milliseconds := 45000
      );
      $cron$
    );

    -- Job Janela 3: 13:00 UTC (10:00 BRT) = 1 execução
    PERFORM cron.schedule(
      'whatsapp-billing-window-3',
      '0 13 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            (SELECT value FROM public.app_internal_config WHERE key = 'cron_secret' LIMIT 1),
            ''
          )
        ),
        body := '{"trigger": "cron_window_3"}'::jsonb,
        timeout_milliseconds := 45000
      );
      $cron$
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Desduplicação do Asaas Reconcile (Apenas 1 Job Oficial)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('asaas-reconcile'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('asaas-reconcile-5min'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('asaas-reconcile-official'); EXCEPTION WHEN OTHERS THEN NULL; END;

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
-- 3. Auditoria DIFF e NO-OP nas Tabelas Reais do Cofrinho
-- ----------------------------------------------------------------------------

-- A. Trigger DIFF para `public.cofrinhos`
CREATE OR REPLACE FUNCTION public.audit_cofrinhos_diff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _diff_old jsonb := '{}'::jsonb;
  _diff_new jsonb := '{}'::jsonb;
BEGIN
  -- INSERT: Registra criação com dados iniciais essenciais
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        NEW.id, NEW.usuario_id, 'INSERT', 'cofrinhos', NEW.id::text,
        NULL,
        jsonb_build_object(
          'id', NEW.id,
          'usuario_id', NEW.usuario_id,
          'nome', NEW.nome,
          'meta', NEW.meta,
          'percentual_cdi', NEW.percentual_cdi,
          'ativo', NEW.ativo,
          'saldo_principal', NEW.saldo_principal,
          'saldo_total', NEW.saldo_total,
          'descricao', NEW.descricao
        ),
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: Filtro NO-OP rigoroso + DIFF simétrico
  IF TG_OP = 'UPDATE' THEN
    -- 1. NO-OP Filter: se nenhum campo material foi alterado (ex: apenas updated_at modificado)
    IF (OLD.nome IS NOT DISTINCT FROM NEW.nome)
       AND (OLD.meta IS NOT DISTINCT FROM NEW.meta)
       AND (OLD.percentual_cdi IS NOT DISTINCT FROM NEW.percentual_cdi)
       AND (OLD.ativo IS NOT DISTINCT FROM NEW.ativo)
       AND (OLD.saldo_principal IS NOT DISTINCT FROM NEW.saldo_principal)
       AND (OLD.saldo_total IS NOT DISTINCT FROM NEW.saldo_total)
       AND (OLD.saldo_rendimento_bruto IS NOT DISTINCT FROM NEW.saldo_rendimento_bruto)
       AND (OLD.saldo_rendimento_liquido IS NOT DISTINCT FROM NEW.saldo_rendimento_liquido)
       AND (OLD.descricao IS NOT DISTINCT FROM NEW.descricao)
    THEN
      RETURN NEW;
    END IF;

    -- 2. Montagem simétrica do DIFF (dados_anteriores e dados_novos com as mesmas chaves alteradas)
    IF OLD.saldo_total IS DISTINCT FROM NEW.saldo_total THEN
      _diff_old := _diff_old || jsonb_build_object('saldo_total', OLD.saldo_total);
      _diff_new := _diff_new || jsonb_build_object('saldo_total', NEW.saldo_total);
    END IF;

    IF OLD.saldo_principal IS DISTINCT FROM NEW.saldo_principal THEN
      _diff_old := _diff_old || jsonb_build_object('saldo_principal', OLD.saldo_principal);
      _diff_new := _diff_new || jsonb_build_object('saldo_principal', NEW.saldo_principal);
    END IF;

    IF OLD.saldo_rendimento_liquido IS DISTINCT FROM NEW.saldo_rendimento_liquido THEN
      _diff_old := _diff_old || jsonb_build_object('saldo_rendimento_liquido', OLD.saldo_rendimento_liquido);
      _diff_new := _diff_new || jsonb_build_object('saldo_rendimento_liquido', NEW.saldo_rendimento_liquido);
    END IF;

    IF OLD.saldo_rendimento_bruto IS DISTINCT FROM NEW.saldo_rendimento_bruto THEN
      _diff_old := _diff_old || jsonb_build_object('saldo_rendimento_bruto', OLD.saldo_rendimento_bruto);
      _diff_new := _diff_new || jsonb_build_object('saldo_rendimento_bruto', NEW.saldo_rendimento_bruto);
    END IF;

    IF OLD.percentual_cdi IS DISTINCT FROM NEW.percentual_cdi THEN
      _diff_old := _diff_old || jsonb_build_object('percentual_cdi', OLD.percentual_cdi);
      _diff_new := _diff_new || jsonb_build_object('percentual_cdi', NEW.percentual_cdi);
    END IF;

    IF OLD.ativo IS DISTINCT FROM NEW.ativo THEN
      _diff_old := _diff_old || jsonb_build_object('ativo', OLD.ativo);
      _diff_new := _diff_new || jsonb_build_object('ativo', NEW.ativo);
    END IF;

    IF OLD.nome IS DISTINCT FROM NEW.nome THEN
      _diff_old := _diff_old || jsonb_build_object('nome', OLD.nome);
      _diff_new := _diff_new || jsonb_build_object('nome', NEW.nome);
    END IF;

    IF OLD.meta IS DISTINCT FROM NEW.meta THEN
      _diff_old := _diff_old || jsonb_build_object('meta', OLD.meta);
      _diff_new := _diff_new || jsonb_build_object('meta', NEW.meta);
    END IF;

    IF OLD.descricao IS DISTINCT FROM NEW.descricao THEN
      _diff_old := _diff_old || jsonb_build_object('descricao', OLD.descricao);
      _diff_new := _diff_new || jsonb_build_object('descricao', NEW.descricao);
    END IF;

    -- 3. Proteção contra DIFF vazio (se nenhum delta for construído, descarta)
    IF _diff_old = '{}'::jsonb AND _diff_new = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- 4. Gravação da auditoria
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        NEW.id, NEW.usuario_id, 'UPDATE', 'cofrinhos', NEW.id::text,
        _diff_old,
        _diff_new,
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE: Preserva dados suficientes para reconstrução histórica
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        OLD.id, OLD.usuario_id, 'DELETE', 'cofrinhos', OLD.id::text,
        jsonb_build_object(
          'id', OLD.id,
          'usuario_id', OLD.usuario_id,
          'nome', OLD.nome,
          'meta', OLD.meta,
          'saldo_total', OLD.saldo_total,
          'saldo_principal', OLD.saldo_principal,
          'percentual_cdi', OLD.percentual_cdi,
          'ativo', OLD.ativo
        ),
        NULL,
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Restringe permissões de execução apenas para roles internas necessárias
REVOKE ALL ON FUNCTION public.audit_cofrinhos_diff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_cofrinhos_diff() TO postgres, service_role;

-- B. Trigger DIFF para `public.cofrinho_aportes`
CREATE OR REPLACE FUNCTION public.audit_cofrinho_aportes_diff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _diff_old jsonb := '{}'::jsonb;
  _diff_new jsonb := '{}'::jsonb;
  _user_id uuid;
BEGIN
  -- INSERT
  IF TG_OP = 'INSERT' THEN
    SELECT usuario_id INTO _user_id FROM public.cofrinhos WHERE id = NEW.cofrinho_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        NEW.cofrinho_id, _user_id, 'INSERT', 'cofrinho_aportes', NEW.id::text,
        NULL,
        jsonb_build_object(
          'id', NEW.id,
          'cofrinho_id', NEW.cofrinho_id,
          'valor_original', NEW.valor_original,
          'saldo_restante', NEW.saldo_restante,
          'data_aporte', NEW.data_aporte,
          'percentual_cdi', NEW.percentual_cdi
        ),
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- 1. NO-OP Filter
    IF (OLD.saldo_restante IS NOT DISTINCT FROM NEW.saldo_restante)
       AND (OLD.rendimento_bruto IS NOT DISTINCT FROM NEW.rendimento_bruto)
       AND (OLD.rendimento_liquido IS NOT DISTINCT FROM NEW.rendimento_liquido)
       AND (OLD.dias_aplicados IS NOT DISTINCT FROM NEW.dias_aplicados)
       AND (OLD.percentual_cdi IS NOT DISTINCT FROM NEW.percentual_cdi)
       AND (OLD.valor_original IS NOT DISTINCT FROM NEW.valor_original)
       AND (OLD.data_aporte IS NOT DISTINCT FROM NEW.data_aporte)
    THEN
      RETURN NEW;
    END IF;

    -- 2. Montagem simétrica do DIFF
    IF OLD.saldo_restante IS DISTINCT FROM NEW.saldo_restante THEN
      _diff_old := _diff_old || jsonb_build_object('saldo_restante', OLD.saldo_restante);
      _diff_new := _diff_new || jsonb_build_object('saldo_restante', NEW.saldo_restante);
    END IF;

    IF OLD.rendimento_liquido IS DISTINCT FROM NEW.rendimento_liquido THEN
      _diff_old := _diff_old || jsonb_build_object('rendimento_liquido', OLD.rendimento_liquido);
      _diff_new := _diff_new || jsonb_build_object('rendimento_liquido', NEW.rendimento_liquido);
    END IF;

    IF OLD.rendimento_bruto IS DISTINCT FROM NEW.rendimento_bruto THEN
      _diff_old := _diff_old || jsonb_build_object('rendimento_bruto', OLD.rendimento_bruto);
      _diff_new := _diff_new || jsonb_build_object('rendimento_bruto', NEW.rendimento_bruto);
    END IF;

    IF OLD.dias_aplicados IS DISTINCT FROM NEW.dias_aplicados THEN
      _diff_old := _diff_old || jsonb_build_object('dias_aplicados', OLD.dias_aplicados);
      _diff_new := _diff_new || jsonb_build_object('dias_aplicados', NEW.dias_aplicados);
    END IF;

    IF OLD.percentual_cdi IS DISTINCT FROM NEW.percentual_cdi THEN
      _diff_old := _diff_old || jsonb_build_object('percentual_cdi', OLD.percentual_cdi);
      _diff_new := _diff_new || jsonb_build_object('percentual_cdi', NEW.percentual_cdi);
    END IF;

    IF OLD.valor_original IS DISTINCT FROM NEW.valor_original THEN
      _diff_old := _diff_old || jsonb_build_object('valor_original', OLD.valor_original);
      _diff_new := _diff_new || jsonb_build_object('valor_original', NEW.valor_original);
    END IF;

    IF OLD.data_aporte IS DISTINCT FROM NEW.data_aporte THEN
      _diff_old := _diff_old || jsonb_build_object('data_aporte', OLD.data_aporte);
      _diff_new := _diff_new || jsonb_build_object('data_aporte', NEW.data_aporte);
    END IF;

    -- 3. Proteção contra DIFF vazio
    IF _diff_old = '{}'::jsonb AND _diff_new = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- 4. Gravação da auditoria
    SELECT usuario_id INTO _user_id FROM public.cofrinhos WHERE id = NEW.cofrinho_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        NEW.cofrinho_id, _user_id, 'UPDATE', 'cofrinho_aportes', NEW.id::text,
        _diff_old,
        _diff_new,
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE
  IF TG_OP = 'DELETE' THEN
    SELECT usuario_id INTO _user_id FROM public.cofrinhos WHERE id = OLD.cofrinho_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_cofrinho') THEN
      INSERT INTO public.auditoria_cofrinho (
        cofrinho_id, usuario_id, operacao, tabela, registro_id,
        dados_anteriores, dados_novos, origem, created_at
      ) VALUES (
        OLD.cofrinho_id, _user_id, 'DELETE', 'cofrinho_aportes', OLD.id::text,
        jsonb_build_object(
          'id', OLD.id,
          'cofrinho_id', OLD.cofrinho_id,
          'valor_original', OLD.valor_original,
          'saldo_restante', OLD.saldo_restante,
          'data_aporte', OLD.data_aporte,
          'percentual_cdi', OLD.percentual_cdi
        ),
        NULL,
        'trigger_diff_v2', now()
      );
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Restringe permissões de execução apenas para roles internas necessárias
REVOKE ALL ON FUNCTION public.audit_cofrinho_aportes_diff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_cofrinho_aportes_diff() TO postgres, service_role;

-- Aplicação das Triggers em Cofrinhos e Cofrinho Aportes
DO $$
BEGIN
  -- Remove triggers anteriores para evitar auditoria concorrente duplicada
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cofrinhos') THEN
    DROP TRIGGER IF EXISTS trg_audit_cofrinhos_diff ON public.cofrinhos;
    DROP TRIGGER IF EXISTS trg_auditoria_cofrinhos ON public.cofrinhos;
    DROP TRIGGER IF EXISTS trg_audit_cofrinho_change_safe ON public.cofrinhos;
    
    CREATE TRIGGER trg_audit_cofrinhos_diff
      AFTER INSERT OR UPDATE OR DELETE ON public.cofrinhos
      FOR EACH ROW EXECUTE FUNCTION public.audit_cofrinhos_diff();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cofrinho_aportes') THEN
    DROP TRIGGER IF EXISTS trg_audit_cofrinho_aportes_diff ON public.cofrinho_aportes;
    DROP TRIGGER IF EXISTS trg_auditoria_cofrinho_aportes ON public.cofrinho_aportes;
    
    CREATE TRIGGER trg_audit_cofrinho_aportes_diff
      AFTER INSERT OR UPDATE OR DELETE ON public.cofrinho_aportes
      FOR EACH ROW EXECUTE FUNCTION public.audit_cofrinho_aportes_diff();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Rotina Automática de Retenção Diária
-- (NÃO EXPURGA auditoria_cofrinho NEM cofrinho_ledger)
-- ----------------------------------------------------------------------------
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

  -- 3. Webhooks do Asaas antigos (> 90 dias): compacta payload de eventos processados mantendo event_id UNIQUE intacto
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'asaas_webhook_events') THEN
    WITH sanitized AS (
      UPDATE public.asaas_webhook_events
         SET payload = '{"sanitized": true, "note": "payload_compacted_after_90d"}'::jsonb
       WHERE created_at < now() - INTERVAL '90 days'
         AND status = 'processed'
         AND payload <> '{"sanitized": true, "note": "payload_compacted_after_90d"}'::jsonb
      RETURNING 1
    )
    SELECT count(*) INTO _deleted_webhooks FROM sanitized;
  END IF;

  -- 4. Auditoria do cofrinho e cofrinho_ledger: 0 expurgos (100% preservados)
  _deleted_cofrinho_audit := 0;

  RETURN jsonb_build_object(
    'executed_at', now(),
    'deleted_cron_job_runs', _deleted_cron_logs,
    'deleted_telegram_logs', _deleted_telegram_logs,
    'sanitized_asaas_webhooks', _deleted_webhooks,
    'deleted_cofrinho_audits', _deleted_cofrinho_audit
  );
END;
$$;

-- Agendamento diário da manutenção às 03:30 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('database-retention-maintenance-daily'); EXCEPTION WHEN OTHERS THEN NULL; END;

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
-- 5. View de Monitoramento de Armazenamento
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
