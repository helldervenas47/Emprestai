-- MIGRATION: 20260906210000_billing_health_and_monitoring.sql
-- Monitoramento financeiro, health check administrativo, detecção de inconsistências e telemetria de reconciliação

BEGIN;

-- 1. Tabela de histórico de execuções da reconciliação
CREATE TABLE IF NOT EXISTS public.billing_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('live', 'sandbox')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  orders_checked integer NOT NULL DEFAULT 0,
  payments_checked integer NOT NULL DEFAULT 0,
  subscriptions_checked integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  requires_review_count integer NOT NULL DEFAULT 0,
  error_message text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'degraded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_reconciliation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_reconciliation_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_reconciliation_runs TO service_role;

-- 2. Índices de performance para monitoramento financeiro
CREATE INDEX IF NOT EXISTS idx_billing_orders_monitor 
  ON public.billing_orders(environment, status, created_at);

CREATE INDEX IF NOT EXISTS idx_billing_orders_review 
  ON public.billing_orders(environment, review_reason) 
  WHERE review_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_monitor 
  ON public.asaas_webhook_events(environment, status, created_at);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_env_created 
  ON public.billing_reconciliation_runs(environment, created_at DESC);

-- 3. Função RPC de Health Check Financeiro e Detecção de Inconsistências
CREATE OR REPLACE FUNCTION public.billing_health_check(_admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  env text;
  last_run RECORD;
  rec_status text := 'OK';
  rec_stale boolean := false;
  overall_health text := 'OK';
  
  -- Métricas
  pending_orders_count integer := 0;
  review_orders_count integer := 0;
  stuck_orders_count integer := 0;
  failures_24h integer := 0;
  webhooks_processed_24h integer := 0;
  webhooks_errors_24h integer := 0;
  
  -- Inconsistências
  inconsistencies jsonb := '[]'::jsonb;
  paid_without_sub RECORD;
  active_without_pay RECORD;
  dup_payments RECORD;
  unapplied_downgrade RECORD;
BEGIN
  -- 1. Proteção de Acesso: Apenas administradores
  IF NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  SELECT environment INTO env FROM public.billing_runtime_config WHERE singleton LIMIT 1;
  env := coalesce(env, 'live');

  -- 2. Última execução da reconciliação
  SELECT * INTO last_run 
    FROM public.billing_reconciliation_runs 
   WHERE environment = env 
   ORDER BY created_at DESC 
   LIMIT 1;

  IF last_run.id IS NULL THEN
    rec_status := 'NO_RUNS_YET';
  ELSIF last_run.status = 'failed' THEN
    rec_status := 'ERROR';
    overall_health := 'DEGRADED';
  ELSIF last_run.finished_at IS NOT NULL AND (now() - last_run.finished_at) > interval '20 minutes' THEN
    rec_status := 'STALE';
    rec_stale := true;
    IF overall_health = 'OK' THEN overall_health := 'DEGRADED'; END IF;
  ELSE
    rec_status := 'OK';
  END IF;

  -- 3. Métricas de ordens
  SELECT count(*) INTO pending_orders_count 
    FROM public.billing_orders 
   WHERE environment = env AND status IN ('pending', 'creating');

  SELECT count(*) INTO review_orders_count 
    FROM public.billing_orders 
   WHERE environment = env AND (review_reason IS NOT NULL OR status = 'review');

  SELECT count(*) INTO stuck_orders_count 
    FROM public.billing_orders 
   WHERE environment = env AND status = 'pending' AND created_at < now() - interval '48 hours';

  -- 4. Métricas de Webhooks nas últimas 24h
  SELECT count(*) INTO webhooks_processed_24h 
    FROM public.asaas_webhook_events 
   WHERE environment = env AND status = 'processed' AND created_at > now() - interval '24 hours';

  SELECT count(*) INTO webhooks_errors_24h 
    FROM public.asaas_webhook_events 
   WHERE environment = env AND status IN ('review', 'error') AND created_at > now() - interval '24 hours';

  -- 5. Falhas de reconciliação nas últimas 24h
  SELECT count(*) INTO failures_24h 
    FROM public.billing_reconciliation_runs 
   WHERE environment = env AND status = 'failed' AND created_at > now() - interval '24 hours';

  -- 6. Detector de Inconsistências:
  -- A. Ordens marcadas como PAID cujo usuário tem assinatura expirada ou inativa
  FOR paid_without_sub IN 
    SELECT o.id AS order_id, o.user_id, o.payment_id, o.amount_cents, s.status AS sub_status, s.current_period_end
      FROM public.billing_orders o
      LEFT JOIN public.subscriptions s ON s.user_id = o.user_id AND s.environment = env
     WHERE o.environment = env AND o.status = 'paid' AND o.revoked_at IS NULL
       AND (s.id IS NULL OR s.status NOT IN ('active', 'paid') OR s.current_period_end < now())
     LIMIT 10
  LOOP
    inconsistencies := inconsistencies || jsonb_build_object(
      'code', 'PAID_ORDER_INACTIVE_SUBSCRIPTION',
      'severity', 'CRITICAL',
      'order_id', paid_without_sub.order_id,
      'user_id', paid_without_sub.user_id,
      'payment_id', paid_without_sub.payment_id,
      'details', 'Ordem paga confirmada mas assinatura do usuário não está ativa'
    );
    overall_health := 'ERROR';
  END LOOP;

  -- B. Assinatura ativa sem nenhum pagamento confirmado e sem manual_override
  FOR active_without_pay IN 
    SELECT s.user_id, s.product_id, s.current_period_end
      FROM public.subscriptions s
     WHERE s.environment = env AND s.status = 'active' AND coalesce(s.manual_override, false) = false
       AND s.product_id NOT IN ('free_plan', 'free', 'trial', 'teste')
       AND NOT EXISTS (
         SELECT 1 FROM public.billing_orders bo 
          WHERE bo.user_id = s.user_id AND bo.environment = env AND bo.status = 'paid' AND bo.revoked_at IS NULL
       )
     LIMIT 10
  LOOP
    inconsistencies := inconsistencies || jsonb_build_object(
      'code', 'ACTIVE_SUB_WITHOUT_PAID_ORDER',
      'severity', 'CRITICAL',
      'user_id', active_without_pay.user_id,
      'product_id', active_without_pay.product_id,
      'details', 'Assinatura ativa sem ordem paga correspondente e sem override manual'
    );
    overall_health := 'ERROR';
  END LOOP;

  -- C. Pagamentos duplicados para o mesmo payment_id
  FOR dup_payments IN 
    SELECT payment_id, count(*) AS total
      FROM public.billing_orders
     WHERE environment = env AND payment_id IS NOT NULL
     GROUP BY payment_id
    HAVING count(*) > 1
     LIMIT 5
  LOOP
    inconsistencies := inconsistencies || jsonb_build_object(
      'code', 'DUPLICATE_PAYMENT_ID',
      'severity', 'CRITICAL',
      'payment_id', dup_payments.payment_id,
      'details', format('payment_id duplicado em %s ordens', dup_payments.total)
    );
    overall_health := 'ERROR';
  END LOOP;

  -- D. Downgrades agendados pendentes cujo vencimento já passou
  FOR unapplied_downgrade IN
    SELECT s.user_id, s.scheduled_plan_id, s.current_period_end
      FROM public.subscriptions s
     WHERE s.environment = env AND s.scheduled_plan_id IS NOT NULL AND s.current_period_end < now()
     LIMIT 5
  LOOP
    inconsistencies := inconsistencies || jsonb_build_object(
      'code', 'PENDING_DOWNGRADE_DUE',
      'severity', 'WARNING',
      'user_id', unapplied_downgrade.user_id,
      'scheduled_plan_id', unapplied_downgrade.scheduled_plan_id,
      'details', 'Downgrade agendado atingiu vencimento e aguarda ciclo de refresh'
    );
    IF overall_health = 'OK' THEN overall_health := 'DEGRADED'; END IF;
  END LOOP;

  -- 7. Montagem da Resposta
  RETURN jsonb_build_object(
    'overall_health', overall_health,
    'environment', env,
    'database', 'OK',
    'asaas_config', 'OK',
    'reconciliation', jsonb_build_object(
      'status', rec_status,
      'is_stale', rec_stale,
      'last_run_at', last_run.finished_at,
      'last_duration_ms', last_run.duration_ms,
      'last_orders_checked', coalesce(last_run.orders_checked, 0),
      'last_failed_count', coalesce(last_run.failed_count, 0)
    ),
    'metrics', jsonb_build_object(
      'pending_orders', pending_orders_count,
      'review_orders', review_orders_count,
      'stuck_pending_orders_48h', stuck_orders_count,
      'webhooks_processed_24h', webhooks_processed_24h,
      'webhooks_errors_24h', webhooks_errors_24h,
      'reconciliation_failures_24h', failures_24h
    ),
    'inconsistencies', inconsistencies,
    'inconsistencies_count', jsonb_array_length(inconsistencies),
    'checked_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.billing_health_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_health_check(uuid) TO authenticated, service_role;

COMMIT;
