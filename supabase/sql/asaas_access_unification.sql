-- ============================================================================
-- Asaas · Unificação do controle de acesso (passos 1, 2 e 5)
-- Rodar UMA vez no Supabase EXTERNO. Idempotente.
--
-- 1) Tabela de auditoria/idempotência dos webhooks do Asaas
-- 2) `is_access_blocked` passa a considerar financial_status/current_period_end
-- 3) RPC `my_access_state` — mesma regra usada pelo front-end
-- ============================================================================

-- 1) Auditoria + idempotência -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      text UNIQUE,                 -- body.id do Asaas (idempotência)
  event_type    text NOT NULL,
  payment_id    text,
  customer_id   text,
  user_id       uuid,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'received', -- received|processed|error|ignored
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS asaas_webhook_events_payment_idx
  ON public.asaas_webhook_events (payment_id);
CREATE INDEX IF NOT EXISTS asaas_webhook_events_customer_idx
  ON public.asaas_webhook_events (customer_id);
CREATE INDEX IF NOT EXISTS asaas_webhook_events_created_idx
  ON public.asaas_webhook_events (created_at DESC);

GRANT ALL ON public.asaas_webhook_events TO service_role;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon: somente service_role (edge function) acessa.

-- Colunas de ciclo/assinatura em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_payment_id      text,
  ADD COLUMN IF NOT EXISTS financial_status     text,
  ADD COLUMN IF NOT EXISTS current_period_end   timestamptz,
  ADD COLUMN IF NOT EXISTS current_plan_id      uuid,
  ADD COLUMN IF NOT EXISTS current_plan_cycle   text,
  ADD COLUMN IF NOT EXISTS last_payment_at      timestamptz;

-- 2) Trava global unificada --------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_access_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner  uuid;
  _p      record;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  _owner := COALESCE(public.get_data_owner_id(_user_id), _user_id);

  SELECT COALESCE(is_blocked, false) AS is_blocked,
         financial_status,
         current_period_end
    INTO _p
    FROM public.profiles
   WHERE user_id = _owner
   LIMIT 1;

  -- (a) bloqueio manual do admin sempre vence
  IF COALESCE(_p.is_blocked, false) THEN
    RETURN true;
  END IF;

  -- (b) período pago vigente (Asaas) libera o acesso
  IF _p.current_period_end IS NOT NULL AND _p.current_period_end > now() THEN
    RETURN false;
  END IF;

  -- (c) status financeiro explicitamente inadimplente/cancelado
  IF _p.financial_status IN ('PAST_DUE', 'CANCELED', 'INACTIVE') THEN
    RETURN true;
  END IF;

  -- (d) fallback: trial expirado sem assinatura paga
  RETURN public.is_trial_expired(_owner);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_access_blocked(uuid) TO authenticated, service_role;

-- 3) RPC única para o front-end ---------------------------------------------
CREATE OR REPLACE FUNCTION public.my_access_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _owner  uuid;
  _p      record;
  _locked boolean;
  _reason text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('locked', false, 'reason', null);
  END IF;

  _owner := COALESCE(public.get_data_owner_id(_uid), _uid);

  SELECT COALESCE(is_blocked, false) AS is_blocked,
         blocked_reason,
         financial_status,
         current_period_end
    INTO _p
    FROM public.profiles
   WHERE user_id = _owner
   LIMIT 1;

  _locked := public.is_access_blocked(_uid);

  IF NOT _locked THEN
    _reason := NULL;
  ELSIF COALESCE(_p.is_blocked, false) THEN
    _reason := 'admin_blocked';
  ELSIF _p.financial_status IN ('PAST_DUE', 'CANCELED', 'INACTIVE') THEN
    _reason := 'past_due';
  ELSE
    _reason := 'plan_expired';
  END IF;

  RETURN jsonb_build_object(
    'owner_id',           _owner,
    'locked',             _locked,
    'reason',             _reason,
    'blocked_reason',     _p.blocked_reason,
    'financial_status',   _p.financial_status,
    'current_period_end', _p.current_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_access_state() TO authenticated, service_role;
