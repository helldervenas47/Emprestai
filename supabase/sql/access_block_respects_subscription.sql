-- ============================================================================
-- Correção: `is_access_blocked` deve respeitar a assinatura ativa em
-- public.subscriptions (inclusive manual_override) e não apenas os campos
-- de profiles (financial_status / current_period_end), que podem ficar
-- dessincronizados e bloquear INSERTs válidos com o erro:
--   new row violates row-level security policy "expenses_block_insert_access"
--
-- Rodar UMA vez no Supabase EXTERNO (SQL Editor). Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.user_id = _user_id
       AND (s.status IN ('active', 'trialing') OR COALESCE(s.manual_override, false))
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_access_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _p     record;
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

  -- (b) assinatura ativa (ou liberação manual) no subscriptions libera
  IF public.has_active_subscription(_owner) THEN
    RETURN false;
  END IF;

  -- (c) período pago vigente registrado no profile libera
  IF _p.current_period_end IS NOT NULL AND _p.current_period_end > now() THEN
    RETURN false;
  END IF;

  -- (d) status financeiro explicitamente inadimplente/cancelado
  IF _p.financial_status IN ('PAST_DUE', 'CANCELED', 'INACTIVE') THEN
    RETURN true;
  END IF;

  -- (e) fallback: trial expirado sem assinatura paga
  RETURN public.is_trial_expired(_owner);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_access_blocked(uuid) TO authenticated, service_role;

-- my_access_state reaproveita is_access_blocked, mas o motivo precisa refletir
-- a nova precedência (assinatura ativa nunca deve reportar past_due).
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

-- Reparo de dados: alinha profiles com assinaturas ativas existentes.
UPDATE public.profiles p
   SET financial_status   = 'ACTIVE',
       current_period_end = GREATEST(
         COALESCE(p.current_period_end, to_timestamp(0)),
         s.current_period_end
       )
  FROM public.subscriptions s
 WHERE s.user_id = p.user_id
   AND (s.status IN ('active', 'trialing') OR COALESCE(s.manual_override, false))
   AND s.current_period_end > now()
   AND (p.financial_status IS DISTINCT FROM 'ACTIVE'
        OR COALESCE(p.current_period_end, to_timestamp(0)) < s.current_period_end);
