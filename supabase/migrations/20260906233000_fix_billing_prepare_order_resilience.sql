-- Atualiza billing_prepare_order para permitir troca de plano/ciclo e re-tentativa sem travar em checkout_in_progress

CREATE OR REPLACE FUNCTION public.billing_prepare_order(
  _uid uuid,
  _env text,
  _key uuid,
  _plan uuid,
  _cycle text,
  _cents bigint,
  _kind text DEFAULT 'pix'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.billing_orders;
  p public.plans;
BEGIN
  PERFORM public.billing_init_account(_uid, _env);
  IF _kind NOT IN ('pix', 'recurring') OR _cycle NOT IN ('monthly', 'semestral', 'annual') OR _cents <= 0 THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  SELECT * INTO p FROM public.plans WHERE id = _plan AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  -- Se a mesma chave de requisição já foi usada para o mesmo pedido
  SELECT * INTO o FROM public.billing_orders
  WHERE user_id = _uid AND environment = _env AND request_key = _key;
  IF FOUND THEN
    IF o.plan_id = _plan AND o.cycle = _cycle AND o.checkout_kind = _kind THEN
      RETURN jsonb_build_object('created', false, 'order', to_jsonb(o));
    END IF;
  END IF;

  -- Se há uma ordem pendente ou em criação
  SELECT * INTO o FROM public.billing_orders
  WHERE user_id = _uid AND environment = _env
    AND ((plan_id = _plan AND cycle = _cycle AND checkout_kind = _kind AND status = 'pending') OR status = 'creating')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Se é exatamente o mesmo plano e ciclo, reaproveita
    IF o.plan_id = _plan AND o.cycle = _cycle AND o.checkout_kind = _kind AND o.status IN ('pending', 'creating') THEN
      RETURN jsonb_build_object('created', false, 'order', to_jsonb(o));
    ELSE
      -- Se o usuário mudou de plano/ciclo, cancela a ordem anterior e cria uma nova
      UPDATE public.billing_orders
      SET status = 'cancelled', review_reason = 'superseded_by_new_checkout', checked_at = now()
      WHERE id = o.id;
    END IF;
  END IF;

  -- Cria a nova ordem
  INSERT INTO public.billing_orders(
    user_id, environment, request_key, plan_id, product_id, cycle, amount_cents, days, checkout_kind
  )
  VALUES (
    _uid, _env, _key, _plan, public.billing_product_id(p.name), _cycle, _cents,
    CASE _cycle WHEN 'annual' THEN 365 WHEN 'semestral' THEN 180 ELSE 30 END,
    _kind
  )
  RETURNING * INTO o;

  RETURN jsonb_build_object('created', true, 'order', to_jsonb(o));
END;
$$;
