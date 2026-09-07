-- ============================================================================
-- MIGRATION: SaaS Financial Analytics & Revenue Dashboard (Asaas / Billing)
-- Read-only analytics engine for platform administrators
-- ============================================================================

-- Índices otimizados para agregação financeira e relatórios
CREATE INDEX IF NOT EXISTS idx_billing_orders_analytics_live
  ON public.billing_orders (environment, status, credited_at DESC)
  WHERE environment = 'live';

CREATE INDEX IF NOT EXISTS idx_billing_orders_analytics_revoked
  ON public.billing_orders (environment, status, revoked_at DESC)
  WHERE environment = 'live' AND status = 'revoked';

CREATE INDEX IF NOT EXISTS idx_billing_orders_analytics_pending
  ON public.billing_orders (environment, status, created_at DESC)
  WHERE environment = 'live' AND status = 'pending';

-- Função RPC: Obter Métricas Financeiras Completas do SaaS
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
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
  
  -- Marcadores de mês atual e anterior (no fuso de São Paulo)
  v_cur_month_start timestamptz;
  v_cur_month_end timestamptz;
  v_prev_month_start timestamptz;
  v_prev_month_end timestamptz;
  
  -- Variáveis de agregação do período
  v_gross_period numeric := 0;
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
  v_active_subs_count integer := 0;
  v_active_trials_count integer := 0;
  v_mrr numeric := 0;
  v_arpu numeric := 0;
  
  -- JSONs agregados
  v_daily_evolution jsonb := '[]'::jsonb;
  v_monthly_evolution jsonb := '[]'::jsonb;
  v_plans_dist jsonb := '[]'::jsonb;
  v_cycles_dist jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  
  v_result jsonb;
BEGIN
  -- 1. Verificação de permissão: somente administradores
  IF NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 2. Validação do ambiente
  IF _env NOT IN ('live', 'sandbox') THEN
    _env := 'live';
  END IF;

  -- 3. Configuração das janelas de tempo no fuso horário de São Paulo
  v_cur_month_start := date_trunc('month', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_cur_month_end := (date_trunc('month', v_now AT TIME ZONE v_tz) + interval '1 month' - interval '1 millisecond') AT TIME ZONE v_tz;
  
  v_prev_month_start := (date_trunc('month', v_now AT TIME ZONE v_tz) - interval '1 month') AT TIME ZONE v_tz;
  v_prev_month_end := (date_trunc('month', v_now AT TIME ZONE v_tz) - interval '1 millisecond') AT TIME ZONE v_tz;

  -- Se não informado, o período padrão é o mês atual
  v_start := COALESCE(_start_date, v_cur_month_start);
  v_end := COALESCE(_end_date, v_now);

  -- 4. Cálculo de Faturamento do Mês Atual (Bruto Confirmado em live)
  SELECT COALESCE(SUM(amount_cents), 0) / 100.0
    INTO v_cur_month_gross
    FROM public.billing_orders
   WHERE environment = _env
     AND status = 'paid'
     AND credited_at >= v_cur_month_start
     AND credited_at <= v_cur_month_end;

  -- 5. Cálculo de Faturamento do Mês Anterior (Bruto Confirmado)
  SELECT COALESCE(SUM(amount_cents), 0) / 100.0
    INTO v_prev_month_gross
    FROM public.billing_orders
   WHERE environment = _env
     AND status = 'paid'
     AND credited_at >= v_prev_month_start
     AND credited_at <= v_prev_month_end;

  -- Variação percentual entre mês atual e anterior (proteção contra divisão por zero)
  IF v_prev_month_gross > 0 THEN
    v_month_growth_pct := ROUND(((v_cur_month_gross - v_prev_month_gross) / v_prev_month_gross) * 100.0, 1);
  ELSIF v_cur_month_gross > 0 THEN
    v_month_growth_pct := 100.0;
  ELSE
    v_month_growth_pct := 0.0;
  END IF;

  -- 6. Agregação Geral do Período Filtrado
  SELECT
    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0) / 100.0,
    COALESCE(COUNT(CASE WHEN status = 'paid' THEN 1 ELSE NULL END), 0),
    COALESCE(SUM(CASE WHEN status = 'revoked' THEN amount_cents ELSE 0 END), 0) / 100.0
  INTO v_gross_period, v_paid_count, v_refunds_period
  FROM public.billing_orders o
  WHERE o.environment = _env
    AND (
      (o.status = 'paid' AND o.credited_at >= v_start AND o.credited_at <= v_end)
      OR (o.status = 'revoked' AND COALESCE(o.revoked_at, o.credited_at, o.created_at) >= v_start AND COALESCE(o.revoked_at, o.credited_at, o.created_at) <= v_end)
    )
    AND (_plan_id IS NULL OR o.plan_id = _plan_id)
    AND (_cycle IS NULL OR o.cycle = _cycle)
    AND (_status IS NULL OR o.status = _status);

  v_net_period := v_gross_period - v_refunds_period;
  IF v_paid_count > 0 THEN
    v_avg_ticket := ROUND(v_gross_period / v_paid_count, 2);
  ELSE
    v_avg_ticket := 0;
  END IF;

  -- 7. Cobranças Pendentes no Momento
  SELECT
    COALESCE(SUM(amount_cents), 0) / 100.0,
    COUNT(*)
  INTO v_pending_amount, v_pending_count
  FROM public.billing_orders
  WHERE environment = _env
    AND status = 'pending'
    AND (_plan_id IS NULL OR plan_id = _plan_id)
    AND (_cycle IS NULL OR cycle = _cycle);

  -- 8. Métricas de Assinaturas e MRR Normalizado
  SELECT
    COUNT(*)
  INTO v_active_subs_count
  FROM public.subscriptions s
  WHERE s.environment = _env
    AND s.status = 'active'
    AND COALESCE(s.current_period_end, now()) > now()
    AND s.product_id != 'free_plan';

  -- MRR Normalizado com base nos planos ativos
  SELECT COALESCE(SUM(
    CASE 
      WHEN o.cycle = 'annual' THEN (o.amount_cents / 100.0) / 12.0
      WHEN o.cycle = 'semestral' THEN (o.amount_cents / 100.0) / 6.0
      ELSE (o.amount_cents / 100.0)
    END
  ), 0)
  INTO v_mrr
  FROM public.subscriptions s
  JOIN LATERAL (
    SELECT cycle, amount_cents 
      FROM public.billing_orders bo 
     WHERE bo.user_id = s.user_id 
       AND bo.environment = _env 
       AND bo.status = 'paid'
     ORDER BY bo.credited_at DESC NULLS LAST 
     LIMIT 1
  ) o ON true
  WHERE s.environment = _env
    AND s.status = 'active'
    AND COALESCE(s.current_period_end, now()) > now()
    AND s.product_id != 'free_plan';

  IF v_active_subs_count > 0 THEN
    v_arpu := ROUND(v_mrr / v_active_subs_count, 2);
  ELSE
    v_arpu := 0;
  END IF;

  -- Contagem de Trials Ativos (usuários em período de teste de 7 dias sem assinatura paga)
  SELECT COUNT(*)
  INTO v_active_trials_count
  FROM public.profiles p
  WHERE p.trial_started_at IS NOT NULL
    AND p.trial_started_at + interval '7 days' > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s 
       WHERE s.user_id = p.user_id 
         AND s.environment = _env 
         AND s.status = 'active' 
         AND COALESCE(s.current_period_end, now()) > now()
    );

  -- 9. Evolução Diária no Período Selecionado
  SELECT COALESCE(jsonb_agg(d ORDER BY d->>'date' ASC), '[]'::jsonb)
  INTO v_daily_evolution
  FROM (
    SELECT 
      to_char(o.credited_at AT TIME ZONE v_tz, 'YYYY-MM-DD') AS date,
      ROUND(SUM(CASE WHEN o.status = 'paid' THEN o.amount_cents ELSE 0 END) / 100.0, 2) AS gross,
      ROUND(SUM(CASE WHEN o.status = 'revoked' THEN o.amount_cents ELSE 0 END) / 100.0, 2) AS refunds,
      ROUND((SUM(CASE WHEN o.status = 'paid' THEN o.amount_cents ELSE 0 END) - SUM(CASE WHEN o.status = 'revoked' THEN o.amount_cents ELSE 0 END)) / 100.0, 2) AS net,
      COUNT(CASE WHEN o.status = 'paid' THEN 1 ELSE NULL END) AS count
    FROM public.billing_orders o
    WHERE o.environment = _env
      AND o.credited_at >= v_start
      AND o.credited_at <= v_end
      AND (_plan_id IS NULL OR o.plan_id = _plan_id)
      AND (_cycle IS NULL OR o.cycle = _cycle)
      AND (_status IS NULL OR o.status = _status)
    GROUP BY to_char(o.credited_at AT TIME ZONE v_tz, 'YYYY-MM-DD')
  ) d;

  -- 10. Evolução Mensal dos Últimos 12 Meses
  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'month' ASC), '[]'::jsonb)
  INTO v_monthly_evolution
  FROM (
    SELECT 
      to_char(o.credited_at AT TIME ZONE v_tz, 'YYYY-MM') AS month,
      to_char(o.credited_at AT TIME ZONE v_tz, 'Mon/YY') AS label,
      ROUND(SUM(CASE WHEN o.status = 'paid' THEN o.amount_cents ELSE 0 END) / 100.0, 2) AS gross,
      ROUND(SUM(CASE WHEN o.status = 'revoked' THEN o.amount_cents ELSE 0 END) / 100.0, 2) AS refunds,
      ROUND((SUM(CASE WHEN o.status = 'paid' THEN o.amount_cents ELSE 0 END) - SUM(CASE WHEN o.status = 'revoked' THEN o.amount_cents ELSE 0 END)) / 100.0, 2) AS net,
      COUNT(CASE WHEN o.status = 'paid' THEN 1 ELSE NULL END) AS count
    FROM public.billing_orders o
    WHERE o.environment = _env
      AND o.credited_at >= (date_trunc('month', v_now AT TIME ZONE v_tz) - interval '11 months') AT TIME ZONE v_tz
      AND o.credited_at <= v_now
    GROUP BY to_char(o.credited_at AT TIME ZONE v_tz, 'YYYY-MM'), to_char(o.credited_at AT TIME ZONE v_tz, 'Mon/YY')
  ) m;

  -- 11. Distribuição de Receita por Plano no Período
  SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'gross')::numeric DESC), '[]'::jsonb)
  INTO v_plans_dist
  FROM (
    SELECT 
      o.plan_id,
      COALESCE(pl.name, CASE 
        WHEN o.product_id = 'basico_plan' THEN 'Básico'
        WHEN o.product_id = 'profissional_plan' THEN 'Profissional'
        WHEN o.product_id = 'empresarial_plan' THEN 'Empresarial'
        ELSE o.product_id 
      END) AS plan_name,
      o.product_id,
      ROUND(SUM(o.amount_cents) / 100.0, 2) AS gross,
      COUNT(*) AS count,
      CASE WHEN v_gross_period > 0 
        THEN ROUND(((SUM(o.amount_cents) / 100.0) / v_gross_period) * 100.0, 1)
        ELSE 0 
      END AS percentage
    FROM public.billing_orders o
    LEFT JOIN public.plans pl ON pl.id = o.plan_id
    WHERE o.environment = _env
      AND o.status = 'paid'
      AND o.credited_at >= v_start
      AND o.credited_at <= v_end
      AND (_plan_id IS NULL OR o.plan_id = _plan_id)
      AND (_cycle IS NULL OR o.cycle = _cycle)
    GROUP BY o.plan_id, pl.name, o.product_id
  ) p;

  -- 12. Distribuição de Receita por Ciclo no Período
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'gross')::numeric DESC), '[]'::jsonb)
  INTO v_cycles_dist
  FROM (
    SELECT 
      o.cycle,
      CASE 
        WHEN o.cycle = 'monthly' THEN 'Mensal'
        WHEN o.cycle = 'semestral' THEN 'Semestral'
        WHEN o.cycle = 'annual' THEN 'Anual'
        ELSE o.cycle
      END AS cycle_label,
      ROUND(SUM(o.amount_cents) / 100.0, 2) AS gross,
      COUNT(*) AS count,
      ROUND((SUM(o.amount_cents) / 100.0) / NULLIF(COUNT(*), 0), 2) AS average_ticket,
      CASE WHEN v_gross_period > 0 
        THEN ROUND(((SUM(o.amount_cents) / 100.0) / v_gross_period) * 100.0, 1)
        ELSE 0 
      END AS percentage
    FROM public.billing_orders o
    WHERE o.environment = _env
      AND o.status = 'paid'
      AND o.credited_at >= v_start
      AND o.credited_at <= v_end
      AND (_plan_id IS NULL OR o.plan_id = _plan_id)
      AND (_cycle IS NULL OR o.cycle = _cycle)
    GROUP BY o.cycle
  ) c;

  -- 13. Últimas Transações do Período
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT 
      o.id,
      o.payment_id,
      o.customer_id,
      o.user_id,
      COALESCE(pr.full_name, pr.username, pr.email, 'Usuário ' || substr(o.user_id::text, 1, 8)) AS user_name,
      pr.email AS user_email,
      COALESCE(pl.name, CASE 
        WHEN o.product_id = 'basico_plan' THEN 'Básico'
        WHEN o.product_id = 'profissional_plan' THEN 'Profissional'
        WHEN o.product_id = 'empresarial_plan' THEN 'Empresarial'
        ELSE o.product_id 
      END) AS plan_name,
      o.cycle,
      ROUND(o.amount_cents / 100.0, 2) AS amount,
      o.status,
      o.checkout_kind,
      o.credited_at,
      o.revoked_at,
      o.due_date,
      o.created_at,
      o.invoice_url
    FROM public.billing_orders o
    LEFT JOIN public.profiles pr ON pr.user_id = o.user_id
    LEFT JOIN public.plans pl ON pl.id = o.plan_id
    WHERE o.environment = _env
      AND (
        (o.status = 'paid' AND o.credited_at >= v_start AND o.credited_at <= v_end)
        OR (o.status != 'paid' AND o.created_at >= v_start AND o.created_at <= v_end)
      )
      AND (_plan_id IS NULL OR o.plan_id = _plan_id)
      AND (_cycle IS NULL OR o.cycle = _cycle)
      AND (_status IS NULL OR o.status = _status)
    ORDER BY COALESCE(o.credited_at, o.created_at) DESC
    LIMIT 200
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

-- Permissões de Acesso
REVOKE ALL ON FUNCTION public.billing_get_saas_financial_metrics FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_get_saas_financial_metrics TO authenticated;
