-- ============================================================================
-- Asaas · sincronização da tabela subscriptions
-- Rodar UMA vez no Supabase EXTERNO (SQL Editor). Idempotente.
--
-- O bloqueio global do app consulta public.subscriptions; portanto pagamentos
-- confirmados pelo webhook do Asaas precisam alimentar esta tabela, além de
-- atualizar profiles.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_payment_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_customer_id
  ON public.subscriptions (asaas_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_payment_id
  ON public.subscriptions (asaas_payment_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.user_id = _user_id
       AND (
         COALESCE(s.status, '') IN ('active', 'trialing', 'paid')
         OR COALESCE(s.manual_override, false)
       )
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
       AND COALESCE(s.product_id, '') NOT IN ('free_plan', 'free', 'trial', 'teste')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated, service_role;