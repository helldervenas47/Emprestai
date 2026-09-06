-- Atualiza billing_refresh_account para acumular dias pagos sobre qualquer validade
-- pré-existente (seja teste grátis, dias manuais ou vigência anterior), garantindo
-- que novos pagamentos nunca sejam ignorados por override manual anterior.

CREATE OR REPLACE FUNCTION public.billing_refresh_account(_uid uuid, _env text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.billing_accounts;
  state jsonb;
  o public.billing_orders;
  ending timestamptz;
  starting timestamptz;
  saved public.subscriptions;
  has_paid boolean := false;
  manual_ending timestamptz;
BEGIN
  PERFORM public.billing_init_account(_uid, _env);
  SELECT * INTO a FROM public.billing_accounts WHERE user_id = _uid AND environment = _env FOR UPDATE;

  -- 1. Baseline inicial
  state := a.baseline;
  IF state->>'status' IN ('active', 'paid', 'trialing') OR (state->>'status' = 'canceled' AND (state->>'cancel_at_period_end')::boolean) THEN
    ending := (state->>'current_period_end')::timestamptz;
  END IF;

  -- 2. Se houver override manual ativo com data futura, preserva como base para soma
  IF a.manual_state IS NOT NULL THEN
    manual_ending := (a.manual_state->>'current_period_end')::timestamptz;
    IF manual_ending IS NOT NULL AND manual_ending > now() THEN
      ending := greatest(coalesce(ending, now()), manual_ending);
    END IF;
    state := a.manual_state;
  END IF;

  -- 3. Acumula todos os pagamentos confirmados do gateway
  FOR o IN SELECT * FROM public.billing_orders
            WHERE user_id = _uid AND environment = _env
              AND credited_at IS NOT NULL AND revoked_at IS NULL
            ORDER BY credited_at, id LOOP
    has_paid := true;
    starting := coalesce(o.credited_at, now());
    -- Soma os dias pagos a partir do término vigente anterior ou da data de crédito
    ending := greatest(coalesce(ending, starting), starting, now()) + make_interval(days => o.days);
    state := jsonb_build_object(
      'plan_id', o.plan_id,
      'product_id', o.product_id,
      'price_id', o.product_id || '_' || o.cycle,
      'status', 'active',
      'current_period_start', coalesce((state->>'current_period_start')::timestamptz, starting),
      'current_period_end', ending,
      'cancel_at_period_end', false,
      'asaas_payment_id', o.payment_id,
      'asaas_customer_id', o.customer_id,
      'manual_override', false
    );
  END LOOP;

  -- 4. Se não houver nenhum pagamento registrado, mantém estritamente o manual_state
  IF NOT has_paid AND a.manual_state IS NOT NULL THEN
    state := a.manual_state;
  END IF;

  state := coalesce(state, jsonb_build_object('product_id', 'free_plan', 'price_id', 'free', 'status', 'expired'));

  INSERT INTO public.subscriptions (
    user_id, environment, paddle_subscription_id, paddle_customer_id, product_id, price_id,
    plan_id, status, current_period_start, current_period_end, cancel_at_period_end, manual_override,
    manual_override_by, manual_override_at, manual_note, asaas_payment_id, asaas_customer_id, updated_at
  ) VALUES (
    _uid, _env, 'billing_' || _uid || '_' || _env, 'billing_' || _uid,
    state->>'product_id', coalesce(state->>'price_id', 'manual'), (state->>'plan_id')::uuid,
    state->>'status', (state->>'current_period_start')::timestamptz, (state->>'current_period_end')::timestamptz,
    coalesce((state->>'cancel_at_period_end')::boolean, false),
    CASE WHEN has_paid THEN false ELSE (a.manual_state IS NOT NULL) END,
    (state->>'manual_override_by')::uuid, (state->>'manual_override_at')::timestamptz, state->>'manual_note',
    state->>'asaas_payment_id', state->>'asaas_customer_id', now()
  )
  ON CONFLICT (user_id, environment) DO UPDATE SET
    product_id = excluded.product_id,
    price_id = excluded.price_id,
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    manual_override = excluded.manual_override,
    manual_override_by = excluded.manual_override_by,
    manual_override_at = excluded.manual_override_at,
    manual_note = excluded.manual_note,
    asaas_payment_id = excluded.asaas_payment_id,
    asaas_customer_id = excluded.asaas_customer_id,
    updated_at = now()
  RETURNING * INTO saved;

  IF _env = (SELECT environment FROM public.billing_runtime_config WHERE singleton) THEN
    UPDATE public.profiles
       SET current_period_end = saved.current_period_end,
           current_plan_id = saved.plan_id,
           financial_status = CASE
             WHEN coalesce(saved.manual_override, false) THEN
               CASE WHEN saved.current_period_end > now() THEN 'ACTIVE' ELSE 'INACTIVE' END
             WHEN saved.status IN ('active', 'paid', 'trialing', 'canceled')
               AND saved.current_period_end > now()
               AND coalesce(saved.current_period_start <= now(), true)
             THEN 'ACTIVE'
             ELSE 'INACTIVE'
           END,
           subscription_bump_at = now()
     WHERE user_id = _uid;
  END IF;

  RETURN to_jsonb(saved);
END $$;

-- Recalcula todas as contas em live que possuem pagamentos para aplicar a nova regra retroativamente
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT DISTINCT user_id FROM public.billing_orders WHERE environment = 'live' AND credited_at IS NOT NULL LOOP
    PERFORM public.billing_refresh_account(rec.user_id, 'live');
  END LOOP;
END $$;
