-- ====================================================================
-- MIGRAÇÃO: SISTEMA DE CUPONS DE DESCONTO COMPLETO
-- ====================================================================

BEGIN;

-- 1. Tabela de Cupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  is_active boolean NOT NULL DEFAULT true,
  applies_to_all_plans boolean NOT NULL DEFAULT false,
  max_uses integer DEFAULT NULL,
  used_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_unique UNIQUE (code)
);

-- 2. Tabela de Relacionamento Cupom <-> Planos
CREATE TABLE IF NOT EXISTS public.coupon_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_plans_coupon_plan_unique UNIQUE (coupon_id, plan_id)
);

-- 3. Tabela de Usos de Cupons (Histórico e Auditoria)
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  cycle text NOT NULL CHECK (cycle IN ('monthly', 'semestral', 'annual')),
  original_amount_cents integer NOT NULL CHECK (original_amount_cents >= 0),
  discount_amount_cents integer NOT NULL CHECK (discount_amount_cents >= 0),
  final_amount_cents integer NOT NULL CHECK (final_amount_cents >= 0),
  order_id uuid REFERENCES public.billing_orders(id) ON DELETE SET NULL,
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Habilitar RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para coupons
DROP POLICY IF EXISTS "Admins have full access to coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins possuem controle total de cupons" ON public.coupons;
CREATE POLICY "Admins have full access to coupons"
  ON public.coupons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Usuários autenticados podem consultar cupons ativos" ON public.coupons;
CREATE POLICY "Usuários autenticados podem consultar cupons ativos"
  ON public.coupons
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role possui acesso total a coupons" ON public.coupons;
CREATE POLICY "Service role possui acesso total a coupons"
  ON public.coupons
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas de RLS para coupon_plans
DROP POLICY IF EXISTS "Public can view coupon plans" ON public.coupon_plans;
DROP POLICY IF EXISTS "Usuários autenticados podem consultar coupon_plans" ON public.coupon_plans;
CREATE POLICY "Public can view coupon plans"
  ON public.coupon_plans FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins have full access to coupon plans" ON public.coupon_plans;
DROP POLICY IF EXISTS "Admins possuem controle total de coupon_plans" ON public.coupon_plans;
CREATE POLICY "Admins have full access to coupon plans"
  ON public.coupon_plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role possui acesso total a coupon_plans" ON public.coupon_plans;
CREATE POLICY "Service role possui acesso total a coupon_plans"
  ON public.coupon_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas de RLS para coupon_usages
DROP POLICY IF EXISTS "Users can view own coupon usages" ON public.coupon_usages;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios usos de cupom" ON public.coupon_usages;
CREATE POLICY "Users can view own coupon usages"
  ON public.coupon_usages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all coupon usages" ON public.coupon_usages;
CREATE POLICY "Admins can view all coupon usages"
  ON public.coupon_usages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role possui acesso total a coupon_usages" ON public.coupon_usages;
CREATE POLICY "Service role possui acesso total a coupon_usages"
  ON public.coupon_usages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_usages TO authenticated, service_role;

-- 5. Função RPC Centralizada para Validar e Calcular Cupom
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code text,
  _plan_id uuid,
  _cycle text,
  _user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_code text;
  v_coupon public.coupons;
  v_plan public.plans;
  v_plan_eligible boolean := false;
  v_months integer;
  v_override numeric;
  v_discount_perc numeric;
  v_original_cents integer;
  v_discount_cents integer;
  v_final_cents integer;
BEGIN
  IF _code IS NULL OR trim(_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'empty_code', 'message', 'Informe o código do cupom.');
  END IF;

  v_normalized_code := upper(trim(_code));

  -- 1. Buscar plano
  SELECT * INTO v_plan FROM public.plans WHERE id = _plan_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'plan_not_found', 'message', 'Plano não encontrado ou inativo.');
  END IF;

  -- 2. Buscar cupom
  SELECT * INTO v_coupon FROM public.coupons WHERE code = v_normalized_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'coupon_not_found', 'message', 'Cupom inválido ou inexistente.');
  END IF;

  -- 3. Verificar se está ativo
  IF v_coupon.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'coupon_inactive', 'message', 'Este cupom não está mais disponível.');
  END IF;

  -- 4. Verificar limite de usos (se configurado)
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_reached', 'message', 'Este cupom já atingiu o limite de utilizações.');
  END IF;

  -- 5. Verificar elegibilidade do plano
  IF v_coupon.applies_to_all_plans IS TRUE THEN
    v_plan_eligible := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.coupon_plans WHERE coupon_id = v_coupon.id AND plan_id = _plan_id
    ) INTO v_plan_eligible;
  END IF;

  IF NOT v_plan_eligible THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'plan_not_eligible', 'message', 'Este cupom não é válido para o plano selecionado.');
  END IF;

  -- 6. Calcular preço original do plano no ciclo
  IF _cycle NOT IN ('monthly', 'semestral', 'annual') THEN
    _cycle := 'monthly';
  END IF;

  v_months := CASE _cycle WHEN 'annual' THEN 12 WHEN 'semestral' THEN 6 ELSE 1 END;
  v_override := CASE _cycle WHEN 'annual' THEN v_plan.price_anual WHEN 'semestral' THEN v_plan.price_semestral ELSE NULL END;
  v_discount_perc := coalesce(CASE _cycle WHEN 'annual' THEN v_plan.discount_anual WHEN 'semestral' THEN v_plan.discount_semestral ELSE 0 END, 0);

  IF v_override IS NOT NULL THEN
    v_original_cents := round(v_override * 100);
  ELSE
    v_original_cents := round(round(coalesce(v_plan.price, 0) * 100) * v_months * (1 - (v_discount_perc / 100.0)));
  END IF;

  IF v_original_cents <= 0 THEN
    v_original_cents := round(coalesce(v_plan.price, 0) * 100);
  END IF;

  -- 7. Calcular desconto
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount_cents := round(v_original_cents * (v_coupon.discount_value / 100.0));
  ELSE
    v_discount_cents := round(v_coupon.discount_value * 100);
  END IF;

  -- Não permitir desconto maior que o valor original (mínimo 0 centavos)
  IF v_discount_cents > v_original_cents THEN
    v_discount_cents := v_original_cents;
  END IF;

  v_final_cents := v_original_cents - v_discount_cents;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'original_cents', v_original_cents,
    'discount_cents', v_discount_cents,
    'final_cents', v_final_cents,
    'message', 'Cupom aplicado com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(text, uuid, text, uuid) TO authenticated, service_role, anon;

COMMIT;
