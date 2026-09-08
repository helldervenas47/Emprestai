-- ====================================================================
-- MIGRAÇÃO: DESCONEXÃO AUTOMÁTICA DE BOTS DO TELEGRAM AO EXPIRAR O PLANO
-- ====================================================================

BEGIN;

-- 1. Função que desconecta todos os vínculos de Telegram de usuários expirados
CREATE OR REPLACE FUNCTION public.disconnect_expired_telegram_links()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_deleted_reports integer := 0;
BEGIN
  -- 1. Identifica usuários com links que NÃO possuem add-on ativo do Telegram e NÃO são administradores
  WITH expired_users AS (
    SELECT DISTINCT tl.user_id
    FROM public.telegram_links tl
    WHERE NOT public.has_user_addon(tl.user_id, 'telegram', 'live')
      AND NOT public.has_role(tl.user_id, 'admin')
  ),
  deleted_links AS (
    DELETE FROM public.telegram_links
    WHERE user_id IN (SELECT user_id FROM expired_users)
    RETURNING user_id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted_links;

  -- 2. Também limpa da tabela dedicada telegram_reports_links caso exista
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'telegram_reports_links'
  ) THEN
    WITH expired_report_users AS (
      SELECT DISTINCT trl.user_id
      FROM public.telegram_reports_links trl
      WHERE NOT public.has_user_addon(trl.user_id, 'telegram', 'live')
        AND NOT public.has_role(trl.user_id, 'admin')
    ),
    deleted_report_links AS (
      DELETE FROM public.telegram_reports_links
      WHERE user_id IN (SELECT user_id FROM expired_report_users)
      RETURNING user_id
    )
    SELECT count(*) INTO v_deleted_reports FROM deleted_report_links;
  END IF;

  RETURN v_deleted_count + v_deleted_reports;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_expired_telegram_links() TO authenticated, service_role;

-- 2. Trigger para desconectar instantaneamente quando o status do user_addons for alterado para não-ativo
CREATE OR REPLACE FUNCTION public.trg_disconnect_telegram_on_addon_expire()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.addon_key = 'telegram' THEN
    -- Se o status não for mais ativo/trialing ou a data final já tiver expirado
    IF (NEW.status NOT IN ('active', 'trialing')) OR 
       (NEW.current_period_end IS NOT NULL AND NEW.current_period_end <= now()) THEN
      
      -- Não desconecta se o usuário for administrador
      IF NOT public.has_role(NEW.user_id, 'admin') THEN
        DELETE FROM public.telegram_links WHERE user_id = NEW.user_id;
        
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'telegram_reports_links'
        ) THEN
          DELETE FROM public.telegram_reports_links WHERE user_id = NEW.user_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_addons_auto_disconnect_telegram ON public.user_addons;
CREATE TRIGGER trg_user_addons_auto_disconnect_telegram
AFTER INSERT OR UPDATE ON public.user_addons
FOR EACH ROW
EXECUTE FUNCTION public.trg_disconnect_telegram_on_addon_expire();

COMMIT;
