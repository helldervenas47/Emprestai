-- ============================================================================
-- MIGRATION: Fix SaaS Historical Order Revenue Calculation
-- Garante que o Faturamento Bruto e a Receita Líquida utilizem estritamente
-- o valor nominal histórico transacionado no momento da compra (amount_cents).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_get_saas_financial_metrics(
  _admin uuid,
  _env text DEFAULT 'live',
  _start_date timestamptz DEFAULT NULL,
  _end_date timestamptz DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _cycle text DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tz text := 'America/Sao_Paulo';
  v_is_admin boolean := false;
  v_start timestamptz;
  v_end timestamptz;
  
  -- Marcadores de mês atual e anterior (no fuso de São Paulo)
  v_cur_month_start timestamptz;
  v_cur_month_end timestamptz;
  v_prev_month_start timestamptz;
  v_prev_month_end timestamptz;
  
  -- Variáveis de agregação do período
  v_gross_period numeric := 0;
  v_discounts_period numeric := 0;
  v_refunds_period numeric := 0;
  v_net_period numeric := 0;
  v_paid_count integer := 0;
  v_avg_ticket numeric := 0;
  
  -- Variáveis do mês atual e anterior
  v_cur_month_gross numeric := 0;
  v_prev_month_gross numeric := 0;
  v_month_growth_pct numeric := 0;
  
  -- Pendentes
  v_pending_amount numeric := 0;
  v_pending_count integer := 0;
  
  -- Assinaturas e MRR
  v_mrr numeric := 0;
  v_arpu numeric := 0;
  v_active_subs_count integer := 0;
  v_active_trials_count integer := 0;
  
  -- Estruturas JSON
  v_daily_evolution jsonb := '[]'::jsonb;
  v_monthly_evolution jsonb := '[]'::jsonb;
  v_plans_dist jsonb := '[]'::jsonb;
  v_cycles_dist jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- 1. Validar se o executor é administrador
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _admin AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem consultar o financeiro do SaaS.';
  END IF;

  -- 2. Configurar limites temporais no timezone de São Paulo
  v_cur_month_start := date_trunc('month', timezone(v_tz, now())) AT TIME ZONE v_tz;
  v_cur_month_end   := (date_trunc('month', timezone(v_tz, now())) + interval '1 month' - interval '1 millisecond') AT TIME ZONE v_tz;
  v_prev_month_start := (date_trunc('month', timezone(v_tz, now())) - interval '1 month') AT TIME ZONE v_tz;
  v_prev_month_end   := (date_trunc('month', timezone(v_tz, now())) - interval '1 millisecond') AT TIME ZONE v_tz;

  v_start := COALESCE(_start_date, v_cur_month_start);
  v_end   := COALESCE(_end_date, v_cur_month_end);

  -- 3. Faturamento Mês Atual (Bruto histórico real transacionado)
  SELECT COALESCE(SUM(bo.amount_cents / 100.0), 0)
  INTO v_cur_month_gross
  FROM public.billing_orders bo
  WHERE bo.environment = _env
    AND bo.status = 'paid'
    AND bo.credited_at >= v_cur_month_start
    AND bo.credited_at <= v_cur_month_end;

  -- 4. Faturamento Mês Anterior (Bruto histórico real transacionado)
  SELECT COALESCE(SUM(bo.amount_cents / 100.0), 0)
  INTO v_prev_month_gross
  FROM public.billing_orders bo
  WHERE bo.environment = _env
    AND bo.status = 'paid'
    AND bo.credited_at >= v_prev_month_start
    AND bo.credited_at <= v_prev_month_end;

  -- Variação percentual mês a mês
  IF v_prev_month_gross > 0 THEN
    v_month_growth_pct := ROUND(((v_cur_month_gross - v_prev_month_gross) / v_prev_month_gross) * 100.0, 1);
  ELSIF v_cur_month_gross > 0 THEN
    v_month_growth_pct := 100.0;
  ELSE
    v_month_growth_pct := 0.0;
  END IF;

  -- 5. Métricas do Período Filtrado (Bruto histórico, Descontos, Estornos, Líquido)
  SELECT
    COALESCE(SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END), 0),
    0.0, -- Descontos adicionais registrados
    COALESCE(SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN bo.amount_cents / 100.0 ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN bo.status = 'paid' THEN 1 END), 0)
  INTO
    v_gross_period,
    v_discounts_period,
    v_refunds_period,
    v_paid_count
  FROM public.billing_orders bo
  WHERE bo.environment = _env
    AND (
      (bo.status = 'paid' AND bo.credited_at >= v_start AND bo.credited_at <= v_end)
      OR
      (bo.status IN ('refunded', 'revoked') AND COALESCE(bo.revoked_at, bo.created_at) >= v_start AND COALESCE(bo.revoked_at, bo.created_at) <= v_end)
    )
    AND (_plan_id IS NULL OR bo.plan_id = _plan_id)
    AND (_cycle IS NULL OR bo.cycle = _cycle)
    AND (_status IS NULL OR bo.status = _status);

  -- Fórmula fundamental: RECEITA LÍQUIDA = BRUTO - DESCONTOS - ESTORNOS
  v_net_period := v_gross_period - v_discounts_period - v_refunds_period;

  IF v_paid_count > 0 THEN
    v_avg_ticket := ROUND(v_gross_period / v_paid_count, 2);
  ELSE
    v_avg_ticket := 0.0;
  END IF;

  -- 6. Ordens Pendentes (Previsão)
  SELECT
    COALESCE(SUM(amount_cents), 0) / 100.0,
    COUNT(1)
  INTO
    v_pending_amount,
    v_pending_count
  FROM public.billing_orders
  WHERE environment = _env
    AND status = 'pending'
    AND (_plan_id IS NULL OR plan_id = _plan_id)
    AND (_cycle IS NULL OR cycle = _cycle);

  -- 7. Assinantes Pagantes Ativos e MRR Normalizado (baseado em pedidos pagos confirmados)
  SELECT 
    COUNT(DISTINCT bo.user_id),
    COALESCE(SUM(
      CASE 
        WHEN bo.cycle = 'annual' THEN (bo.amount_cents / 100.0) / 12.0
        WHEN bo.cycle = 'semestral' THEN (bo.amount_cents / 100.0) / 6.0
        ELSE (bo.amount_cents / 100.0)
      END
    ), 0)
  INTO v_active_subs_count, v_mrr
  FROM (
    SELECT DISTINCT ON (user_id) user_id, amount_cents, cycle
    FROM public.billing_orders
    WHERE environment = _env AND status = 'paid'
    ORDER BY user_id, credited_at DESC NULLS LAST, created_at DESC
  ) bo;

  IF v_active_subs_count > 0 THEN
    v_arpu := ROUND(v_mrr / v_active_subs_count, 2);
  ELSE
    v_arpu := 0.0;
  END IF;

  -- 8. Trials Ativos (Últimos 7 dias sem pedido pago)
  SELECT COUNT(1)
  INTO v_active_trials_count
  FROM public.profiles p
  WHERE p.trial_started_at IS NOT NULL
    AND p.trial_started_at >= (now() - interval '7 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_orders bo
      WHERE bo.user_id = p.user_id AND bo.environment = _env AND bo.status = 'paid'
    );

  -- 9. Evolução Diária (Bruto, Descontos, Estornos, Líquido)
  SELECT COALESCE(jsonb_agg(d ORDER BY d->>'date'), '[]'::jsonb)
  INTO v_daily_evolution
  FROM (
    SELECT 
      to_char(timezone(v_tz, COALESCE(bo.credited_at, bo.created_at)), 'YYYY-MM-DD') AS date,
      ROUND(SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS gross,
      0.0 AS discounts,
      ROUND(SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS refunds,
      ROUND(
        SUM(CASE WHEN bo.status = 'paid' THEN (bo.amount_cents / 100.0) ELSE 0 END) -
        SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN (bo.amount_cents / 100.0) ELSE 0 END)
      , 2) AS net,
      COUNT(CASE WHEN bo.status = 'paid' THEN 1 END) AS count
    FROM public.billing_orders bo
    WHERE bo.environment = _env
      AND (
        (bo.status = 'paid' AND bo.credited_at >= v_start AND bo.credited_at <= v_end)
        OR
        (bo.status IN ('refunded', 'revoked') AND COALESCE(bo.revoked_at, bo.created_at) >= v_start AND COALESCE(bo.revoked_at, bo.created_at) <= v_end)
      )
      AND (_plan_id IS NULL OR bo.plan_id = _plan_id)
      AND (_cycle IS NULL OR bo.cycle = _cycle)
      AND (_status IS NULL OR bo.status = _status)
    GROUP BY 1
  ) d;

  -- 10. Evolução Mensal (Últimos 12 meses)
  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'month'), '[]'::jsonb)
  INTO v_monthly_evolution
  FROM (
    SELECT 
      to_char(timezone(v_tz, bo.credited_at), 'YYYY-MM') AS month,
      to_char(timezone(v_tz, bo.credited_at), 'Mon/YY') AS label,
      ROUND(SUM(bo.amount_cents / 100.0), 2) AS gross,
      0.0 AS discounts,
      0.0 AS refunds,
      ROUND(SUM(bo.amount_cents / 100.0), 2) AS net,
      COUNT(1) AS count
    FROM public.billing_orders bo
    WHERE bo.environment = _env
      AND bo.status = 'paid'
      AND bo.credited_at >= (v_current_month_start - interval '11 months')
    GROUP BY 1, 2
  ) m;

  -- 11. Distribuição por Plano (com Bruto histórico, Descontos, Estornos e Líquido)
  SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'gross')::numeric DESC), '[]'::jsonb)
  INTO v_plans_dist
  FROM (
    SELECT 
      bo.plan_id,
      COALESCE(pl.name, bo.product_id, 'Outros') AS plan_name,
      bo.product_id,
      ROUND(SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS gross,
      0.0 AS discounts,
      ROUND(SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS refunds,
      ROUND(
        SUM(CASE WHEN bo.status = 'paid' THEN (bo.amount_cents / 100.0) ELSE 0 END) -
        SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN (bo.amount_cents / 100.0) ELSE 0 END)
      , 2) AS net,
      COUNT(CASE WHEN bo.status = 'paid' THEN 1 END) AS count,
      CASE WHEN v_gross_period > 0 
        THEN ROUND((SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END) / v_gross_period) * 100.0, 1)
        ELSE 0.0 
      END AS percentage
    FROM public.billing_orders bo
    LEFT JOIN public.plans pl ON pl.id = bo.plan_id
    WHERE bo.environment = _env
      AND (
        (bo.status = 'paid' AND bo.credited_at >= v_start AND bo.credited_at <= v_end)
        OR
        (bo.status IN ('refunded', 'revoked') AND COALESCE(bo.revoked_at, bo.created_at) >= v_start AND COALESCE(bo.revoked_at, bo.created_at) <= v_end)
      )
    GROUP BY bo.plan_id, pl.name, bo.product_id
  ) p;

  -- 12. Distribuição por Ciclo
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'gross')::numeric DESC), '[]'::jsonb)
  INTO v_cycles_dist
  FROM (
    SELECT 
      bo.cycle,
      CASE 
        WHEN bo.cycle = 'annual' THEN 'Anual'
        WHEN bo.cycle = 'semestral' THEN 'Semestral'
        ELSE 'Mensal'
      END AS cycle_label,
      ROUND(SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS gross,
      0.0 AS discounts,
      ROUND(SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN bo.amount_cents / 100.0 ELSE 0 END), 2) AS refunds,
      ROUND(
        SUM(CASE WHEN bo.status = 'paid' THEN (bo.amount_cents / 100.0) ELSE 0 END) -
        SUM(CASE WHEN bo.status IN ('refunded', 'revoked') THEN (bo.amount_cents / 100.0) ELSE 0 END)
      , 2) AS net,
      COUNT(CASE WHEN bo.status = 'paid' THEN 1 END) AS count,
      CASE WHEN v_gross_period > 0 
        THEN ROUND((SUM(CASE WHEN bo.status = 'paid' THEN bo.amount_cents / 100.0 ELSE 0 END) / v_gross_period) * 100.0, 1)
        ELSE 0.0 
      END AS percentage
    FROM public.billing_orders bo
    WHERE bo.environment = _env
      AND (
        (bo.status = 'paid' AND bo.credited_at >= v_start AND bo.credited_at <= v_end)
        OR
        (bo.status IN ('refunded', 'revoked') AND COALESCE(bo.revoked_at, bo.created_at) >= v_start AND COALESCE(bo.revoked_at, bo.created_at) <= v_end)
      )
    GROUP BY bo.cycle
  ) c;

  -- 13. Transações Recentes
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT 
      bo.id,
      bo.payment_id,
      bo.customer_id,
      bo.user_id,
      COALESCE(pr.display_name, 'Usuário ' || SUBSTRING(bo.user_id::text, 1, 8)) AS user_name,
      NULL AS user_email,
      COALESCE(pl.name, bo.product_id, 'Plano') AS plan_name,
      bo.cycle,
      ROUND(bo.amount_cents / 100.0, 2) AS original_amount,
      0.0 AS discount_amount,
      ROUND(bo.amount_cents / 100.0, 2) AS amount,
      bo.status,
      bo.checkout_kind,
      bo.credited_at,
      bo.revoked_at,
      bo.due_date,
      bo.created_at,
      bo.invoice_url
    FROM public.billing_orders bo
    LEFT JOIN public.plans pl ON pl.id = bo.plan_id
    LEFT JOIN public.profiles pr ON pr.user_id = bo.user_id
    WHERE bo.environment = _env
      AND (
        (bo.status = 'paid' AND bo.credited_at >= v_start AND bo.credited_at <= v_end)
        OR
        (bo.status IN ('refunded', 'revoked') AND COALESCE(bo.revoked_at, bo.created_at) >= v_start AND COALESCE(bo.revoked_at, bo.created_at) <= v_end)
        OR
        (bo.status = 'pending' AND bo.created_at >= v_start AND bo.created_at <= v_end)
      )
      AND (_plan_id IS NULL OR bo.plan_id = _plan_id)
      AND (_cycle IS NULL OR bo.cycle = _cycle)
      AND (_status IS NULL OR bo.status = _status)
    ORDER BY COALESCE(bo.credited_at, bo.created_at) DESC
    LIMIT 100
  ) t;

  -- 14. Montagem do Resultado JSON
  v_result := jsonb_build_object(
    'environment', _env,
    'timezone', v_tz,
    'period', jsonb_build_object(
      'start', v_start,
      'end', v_end
    ),
    'summary', jsonb_build_object(
      'gross_revenue', v_gross_period,
      'app_discounts', v_discounts_period,
      'refunds_amount', v_refunds_period,
      'net_revenue', v_net_period,
      'paid_orders_count', v_paid_count,
      'average_ticket', v_avg_ticket,
      'pending_amount', v_pending_amount,
      'pending_orders_count', v_pending_count,
      'current_month_gross', v_cur_month_gross,
      'previous_month_gross', v_prev_month_gross,
      'month_growth_pct', v_month_growth_pct,
      'mrr', ROUND(v_mrr, 2),
      'arpu', v_arpu,
      'active_subscribers_count', v_active_subs_count,
      'active_trials_count', v_active_trials_count
    ),
    'daily_evolution', v_daily_evolution,
    'monthly_evolution', v_monthly_evolution,
    'plans_distribution', v_plans_dist,
    'cycles_distribution', v_cycles_dist,
    'recent_transactions', v_transactions
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_get_saas_financial_metrics TO authenticated;
