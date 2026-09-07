-- Migração para Add-ons Premium (ex: EmprestAI Telegram)
-- Criação da tabela user_addons e registro no catálogo de planos

BEGIN;

-- 1. Tabela para gerenciar Add-ons independentes de cada usuário
CREATE TABLE IF NOT EXISTS public.user_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'sandbox')),
  addon_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'past_due', 'canceled', 'expired', 'trialing')),
  price_cents integer NOT NULL DEFAULT 1490,
  cycle text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'semestral', 'annual')),
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_payment_id text,
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_addons_user_env_key_unique UNIQUE (user_id, environment, addon_key)
);

-- Habilitar RLS na tabela user_addons
ALTER TABLE public.user_addons ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para user_addons
DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios add-ons" ON public.user_addons;
CREATE POLICY "Usuários podem visualizar seus próprios add-ons"
  ON public.user_addons
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    auth.uid() = public.get_data_owner_id(user_id) OR
    public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Service role possui acesso total aos add-ons" ON public.user_addons;
CREATE POLICY "Service role possui acesso total aos add-ons"
  ON public.user_addons
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Permissões
GRANT SELECT ON public.user_addons TO authenticated;
GRANT ALL ON public.user_addons TO service_role;

-- 2. Garantir o plano do EmprestAI Telegram no catálogo de planos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans') THEN
    ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS addon_key text;

    INSERT INTO public.plans (
      id,
      name,
      price_cents,
      active,
      is_addon,
      addon_key,
      features
    ) VALUES (
      'b4e60000-0000-0000-0000-000000000001'::uuid,
      '👑 EmprestAI Telegram',
      1490,
      true,
      true,
      'telegram',
      '["Relatórios automáticos no Telegram", "Cadastro de despesas por mensagem", "Categorização inteligente", "Agendamentos personalizados"]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      price_cents = EXCLUDED.price_cents,
      active = EXCLUDED.active,
      is_addon = true,
      addon_key = 'telegram',
      features = EXCLUDED.features;
  END IF;
END $$;

-- 3. Função e Trigger para sincronizar ordens de Add-ons com a tabela user_addons
CREATE OR REPLACE FUNCTION public.sync_user_addon_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans;
  v_addon_key text;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
BEGIN
  -- Identifica se o plano da ordem é um Add-on
  SELECT * INTO v_plan FROM public.plans WHERE id = NEW.plan_id;
  
  IF v_plan.is_addon IS TRUE OR v_plan.addon_key IS NOT NULL OR v_plan.id = 'b4e60000-0000-0000-0000-000000000001'::uuid THEN
    v_addon_key := coalesce(v_plan.addon_key, 'telegram');

    IF NEW.status = 'paid' AND NEW.credited_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      v_status := 'active';
      v_start := NEW.credited_at;
      v_end := NEW.credited_at + make_interval(days => NEW.days);
    ELSIF NEW.status = 'revoked' THEN
      v_status := 'expired';
      v_start := NEW.created_at;
      v_end := now();
    ELSE
      v_status := 'pending';
      v_start := NEW.created_at;
      v_end := NULL;
    END IF;

    INSERT INTO public.user_addons (
      user_id,
      environment,
      addon_key,
      status,
      price_cents,
      cycle,
      asaas_customer_id,
      asaas_payment_id,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      updated_at
    ) VALUES (
      NEW.user_id,
      NEW.environment,
      v_addon_key,
      v_status,
      NEW.amount_cents,
      NEW.cycle,
      NEW.customer_id,
      NEW.payment_id,
      v_start,
      v_end,
      false,
      now()
    )
    ON CONFLICT (user_id, environment, addon_key) DO UPDATE SET
      status = EXCLUDED.status,
      price_cents = EXCLUDED.price_cents,
      cycle = EXCLUDED.cycle,
      asaas_customer_id = coalesce(EXCLUDED.asaas_customer_id, user_addons.asaas_customer_id),
      asaas_payment_id = coalesce(EXCLUDED.asaas_payment_id, user_addons.asaas_payment_id),
      current_period_start = coalesce(EXCLUDED.current_period_start, user_addons.current_period_start),
      current_period_end = CASE WHEN EXCLUDED.status = 'active' THEN EXCLUDED.current_period_end ELSE user_addons.current_period_end END,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_addon_order ON public.billing_orders;
CREATE TRIGGER trg_sync_user_addon_order
AFTER INSERT OR UPDATE ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_addon_order();

-- 4. Função RPC para verificar se um usuário possui o add-on ativo
CREATE OR REPLACE FUNCTION public.has_user_addon(
  _user_id uuid,
  _addon_key text,
  _env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean := false;
  v_owner_id uuid;
BEGIN
  v_owner_id := coalesce(public.get_data_owner_id(_user_id), _user_id);

  -- Verifica se existe registro ativo na tabela user_addons com período válido
  SELECT EXISTS (
    SELECT 1
    FROM public.user_addons
    WHERE user_id = v_owner_id
      AND environment = _env
      AND addon_key = _addon_key
      AND status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_active;

  -- Se for admin com override ou ambiente de desenvolvimento liberado
  IF NOT v_active AND public.has_role(_user_id, 'admin') THEN
    v_active := true;
  END IF;

  RETURN v_active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_user_addon(uuid, text, text) TO authenticated, service_role;

COMMIT;
