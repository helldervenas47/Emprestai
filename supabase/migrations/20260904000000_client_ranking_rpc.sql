-- ==============================================================================
-- Migration: RPC Consolidada de Ranking de Clientes (Módulo Cadastro)
-- Utiliza as tabelas reais do sistema: public.clients, public.loans, public.payments
-- Exibe apenas clientes com pelo menos 1 empréstimo cadastrado.
-- ==============================================================================

-- 1. ÍNDICES DE PERFORMANCE (IDEMPOTENTES)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loans_user_borrower_created 
  ON public.loans (user_id, borrower_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_user_loan_date 
  ON public.payments (user_id, loan_id, date);

-- 2. FUNÇÃO RPC CONSOLIDADA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_client_ranking(
  p_ranking_type TEXT DEFAULT 'best',
  p_period TEXT DEFAULT 'all',
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_search TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_period_start DATE;
  v_period_end DATE;
  v_offset INTEGER;
  v_result JSONB;
BEGIN
  -- Identifica o usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'data', '[]'::jsonb,
      'total_count', 0,
      'page', p_page,
      'page_size', p_page_size,
      'total_pages', 0
    );
  END IF;

  -- Define o intervalo de datas com base no filtro de período
  IF p_period = 'this_month' THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  ELSIF p_period = 'last_month' THEN
    v_period_start := (date_trunc('month', CURRENT_DATE) - interval '1 month')::DATE;
    v_period_end := (date_trunc('month', CURRENT_DATE) - interval '1 day')::DATE;
  ELSIF p_period = 'last_3_months' THEN
    v_period_start := (date_trunc('month', CURRENT_DATE) - interval '2 months')::DATE;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  ELSIF p_period = 'last_6_months' THEN
    v_period_start := (date_trunc('month', CURRENT_DATE) - interval '5 months')::DATE;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  ELSIF p_period = 'this_year' THEN
    v_period_start := date_trunc('year', CURRENT_DATE)::DATE;
    v_period_end := (date_trunc('year', CURRENT_DATE) + interval '1 year - 1 day')::DATE;
  ELSIF p_period = 'custom' AND p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_period_start := p_start_date;
    v_period_end := p_end_date;
  ELSE
    -- 'all' ou indefinido
    v_period_start := '2000-01-01'::DATE;
    v_period_end := '2099-12-31'::DATE;
  END IF;

  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  WITH client_base AS (
    SELECT 
      c.id,
      c.name,
      c.phone,
      c.cpf,
      c.cnpj,
      COALESCE(c.score_tempo_real, c.score_risco, 100.0) AS base_score
    FROM public.clients c
    WHERE c.user_id = v_user_id
      AND EXISTS (
        SELECT 1 FROM public.loans l_exist 
        WHERE l_exist.borrower_id = c.id
      )
      AND (
        p_search = '' 
        OR c.name ILIKE '%' || p_search || '%'
        OR c.cpf ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
      )
  ),
  loan_agg AS (
    SELECT
      l.borrower_id AS client_id,
      COUNT(l.id) AS total_loans,
      COUNT(l.id) FILTER (WHERE l.status = 'paid') AS paid_loans,
      COUNT(l.id) FILTER (WHERE l.status != 'paid' AND l.due_date < CURRENT_DATE::TEXT) AS overdue_loans,
      COALESCE(SUM(l.amount), 0) AS total_borrowed,
      COALESCE(SUM(CASE WHEN l.status != 'paid' AND l.status != 'cancelled' THEN COALESCE(l.remaining_amount, l.amount) ELSE 0 END), 0) AS open_amount
    FROM public.loans l
    WHERE l.user_id = v_user_id
      AND (
        p_period = 'all' 
        OR (l.created_at::DATE >= v_period_start AND l.created_at::DATE <= v_period_end)
        OR (l.start_date::DATE >= v_period_start AND l.start_date::DATE <= v_period_end)
      )
    GROUP BY l.borrower_id
  ),
  payment_agg AS (
    SELECT
      l.borrower_id AS client_id,
      COUNT(p.id) AS total_payments,
      COALESCE(SUM(p.amount), 0) AS total_received,
      COALESCE(SUM(
        CASE 
          WHEN l.amount > 0 AND l.interest_rate > 0 THEN 
            p.amount * (l.interest_rate / (100.0 + l.interest_rate))
          ELSE 0 
        END
      ), 0) AS profit_generated,
      COUNT(p.id) FILTER (
        WHERE p.date::DATE <= (l.start_date::DATE + (p.installment_number * interval '1 month') + interval '3 days')::DATE
      ) AS on_time_payments,
      COUNT(p.id) FILTER (
        WHERE p.date::DATE > (l.start_date::DATE + (p.installment_number * interval '1 month') + interval '3 days')::DATE
      ) AS late_payments,
      COALESCE(MAX(
        GREATEST(0, (p.date::DATE - (l.start_date::DATE + (p.installment_number * interval '1 month'))::DATE))
      ), 0) AS max_delay_days
    FROM public.payments p
    JOIN public.loans l ON l.id = p.loan_id
    WHERE p.user_id = v_user_id
      AND (
        p_period = 'all' 
        OR (p.date::DATE >= v_period_start AND p.date::DATE <= v_period_end)
      )
    GROUP BY l.borrower_id
  ),
  consolidated AS (
    SELECT
      cb.id AS client_id,
      cb.name AS client_name,
      cb.phone AS client_phone,
      cb.cpf AS client_cpf,
      cb.cnpj AS client_cnpj,
      GREATEST(0, LEAST(150,
        CASE
          WHEN COALESCE(la.total_loans, 0) = 0 THEN 100
          ELSE (
            100 
            + (COALESCE(pa.on_time_payments, 0) * 3)
            - (COALESCE(pa.late_payments, 0) * 5)
            + (COALESCE(la.paid_loans, 0) * 5)
            - (COALESCE(la.overdue_loans, 0) * 10)
          )
        END
      )) AS score,
      COALESCE(la.total_loans, 0) AS total_loans,
      COALESCE(la.total_borrowed, 0.0) AS total_borrowed,
      COALESCE(la.open_amount, 0.0) AS open_amount,
      COALESCE(pa.total_payments, 0) AS total_payments,
      COALESCE(pa.total_received, 0.0) AS total_received,
      COALESCE(pa.profit_generated, 0.0) AS profit_generated,
      COALESCE(pa.on_time_payments, 0) AS on_time_payments,
      COALESCE(pa.late_payments, 0) AS late_payments,
      COALESCE(pa.max_delay_days, 0) AS max_delay_days,
      CASE 
        WHEN (COALESCE(pa.total_payments, 0) + COALESCE(la.overdue_loans, 0)) > 0 THEN
          ROUND((COALESCE(pa.on_time_payments, 0)::NUMERIC / (COALESCE(pa.total_payments, 0) + COALESCE(la.overdue_loans, 0))::NUMERIC) * 100.0, 1)
        ELSE 100.0
      END AS on_time_percentage
    FROM client_base cb
    LEFT JOIN loan_agg la ON la.client_id = cb.id
    LEFT JOIN payment_agg pa ON pa.client_id = cb.id
  ),
  ranked AS (
    SELECT
      c.*,
      COUNT(*) OVER() AS full_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_ranking_type = 'best' THEN (c.score * 0.45 + c.on_time_percentage * 0.35 + LEAST(100.0, c.total_loans * 10.0) * 0.2 - (CASE WHEN c.max_delay_days > 0 THEN 40 ELSE 0 END)) END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'best' THEN c.total_received END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'on_time' THEN c.on_time_percentage END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'on_time' THEN (CASE WHEN c.max_delay_days = 0 THEN 0 ELSE 1 END) END ASC NULLS LAST,
          CASE WHEN p_ranking_type = 'on_time' THEN c.score END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'on_time' THEN c.max_delay_days END ASC NULLS LAST,
          CASE WHEN p_ranking_type = 'on_time' THEN c.on_time_payments END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'revenue' THEN c.profit_generated END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'revenue' THEN c.total_received END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'volume' THEN c.total_borrowed END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'volume' THEN c.total_loans END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'frequent' THEN c.total_loans END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'frequent' THEN c.total_borrowed END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'frequent' THEN c.score END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'risk' THEN c.score END ASC NULLS LAST,
          CASE WHEN p_ranking_type = 'risk' THEN c.max_delay_days END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'risk' THEN c.open_amount END DESC NULLS LAST,
          
          CASE WHEN p_ranking_type = 'late' THEN c.max_delay_days END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'late' THEN c.late_payments END DESC NULLS LAST,
          CASE WHEN p_ranking_type = 'late' THEN c.open_amount END DESC NULLS LAST,
          
          c.client_name ASC
      ) AS rank_position
    FROM consolidated c
  )
  SELECT jsonb_build_object(
    'data', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'position', r.rank_position,
          'client_id', r.client_id,
          'client_name', r.client_name,
          'client_phone', r.client_phone,
          'client_cpf', r.client_cpf,
          'client_cnpj', r.client_cnpj,
          'score', r.score,
          'total_loans', r.total_loans,
          'total_borrowed', r.total_borrowed,
          'open_amount', r.open_amount,
          'total_payments', r.total_payments,
          'total_received', r.total_received,
          'profit_generated', r.profit_generated,
          'on_time_payments', r.on_time_payments,
          'late_payments', r.late_payments,
          'on_time_percentage', r.on_time_percentage,
          'max_delay_days', r.max_delay_days
        )
      ),
      '[]'::jsonb
    ),
    'total_count', COALESCE((SELECT full_count FROM ranked LIMIT 1), 0),
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', CEIL(COALESCE((SELECT full_count FROM ranked LIMIT 1), 0)::NUMERIC / p_page_size::NUMERIC)
  )
  INTO v_result
  FROM (
    SELECT * FROM ranked
    ORDER BY rank_position ASC
    LIMIT p_page_size
    OFFSET v_offset
  ) r;

  RETURN v_result;
END;
$$;
