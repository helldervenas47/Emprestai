-- ============================================================================
-- SCRIPT DE ROLLBACK CONTROLADO: REVERSÃO DA MIGRAÇÃO 20260918010000
-- Arquivo: supabase/migrations/20260918010000_rollback_database_audit_and_retention_hardening.sql
-- ============================================================================

-- 1. Remoção das Triggers Novas de DIFF
DROP TRIGGER IF EXISTS trg_audit_cofrinhos_diff ON public.cofrinhos;
DROP TRIGGER IF EXISTS trg_audit_cofrinho_aportes_diff ON public.cofrinho_aportes;
DROP FUNCTION IF EXISTS public.audit_cofrinhos_diff();
DROP FUNCTION IF EXISTS public.audit_cofrinho_aportes_diff();

-- 2. Restauração Segura das Triggers Legadas de Auditoria (Caso Necessário)
-- Restaura a trigger de auditoria sem o bug de 10s ou scripts destrutivos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cofrinhos') THEN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_cofrinho_change_safe') THEN
      CREATE TRIGGER trg_audit_cofrinho_change_safe
        AFTER INSERT OR UPDATE OR DELETE ON public.cofrinhos
        FOR EACH ROW EXECUTE FUNCTION public.audit_cofrinho_change_safe();
    END IF;
  END IF;
END $$;

-- 3. Remoção da View de Monitoramento
DROP VIEW IF EXISTS public.admin_database_storage_stats;

-- 4. Reversão dos Crons
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Desagenda os sub-jobs de 71 disparos
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-1'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-2'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('whatsapp-billing-window-3'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('database-retention-maintenance-daily'); EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Mantém a reconciliação do Asaas operacional (evita deixar o sistema sem reconciliação)
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

-- 5. Remoção da Função de Manutenção
DROP FUNCTION IF EXISTS public.execute_database_retention_maintenance();
