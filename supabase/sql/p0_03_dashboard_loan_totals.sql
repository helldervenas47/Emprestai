-- P0-03 (etapa A + validação): RPC agregada para totais do Dashboard.
--
-- Objetivo: permitir que o Dashboard obtenha os totais consolidados de
-- empréstimos em uma única requisição, sem baixar loans + payments completos.
--
-- Paridade com o frontend (src/components/dashboard/useDashboardMetrics.ts):
--   * remaining_capital = Σ amount * (installments - paid_installments) / installments
--     dos contratos com status <> 'paid' (fórmula proporcional — igual a
--     "capitalOnStreet"). NÃO usa loans.remaining_amount (esse campo diverge).
--   * overdue_count = contratos ativos com ao menos uma parcela vencida
--     em public.loan_installments (paid = false, due_date < CURRENT_DATE),
--     com fallback para loans.due_date < CURRENT_DATE quando não há
--     schedule cadastrado.
--   * total_received = Σ payments.amount ∈ [_start, _end]  (equivalente a
--     "incomeFromPayments" no frontend — sem somar vendas).
--   * total_interest_received = juros diretos (installment_number <= 0)
--     + rateio pela razão de juros das parcelas normais.
--
-- Segurança: SECURITY DEFINER + search_path = public. Escopo via
-- get_data_owner_id(auth.uid()) — respeita user_owner.

CREATE OR REPLACE FUNCTION public.dashboard_loan_totals(
  _start date,
  _end   date
)
RETURNS TABLE(
  owner_id            uuid,
  loans_count         bigint,
  loans_active_count  bigint,
  loans_paid_count    bigint,
  total_lent          numeric,      -- Σ loans.amount (todo o histórico)
  total_lent_period   numeric,      -- Σ loans.amount cujo start_date ∈ [_start,_end]
  total_received      numeric,      -- Σ payments.amount ∈ [_start,_end]  (= incomeFromPayments)
  total_interest_received numeric,  -- juros recebidos ∈ [_start,_end]
  remaining_capital   numeric,      -- capitalOnStreet proporcional
  overdue_count       bigint        -- contratos ativos c/ parcela vencida
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_data_owner_id(auth.uid());
  IF _owner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scoped_loans AS (
    SELECT l.*
    FROM public.loans l
    WHERE l.user_id = _owner
  ),
  active_loans AS (
    SELECT * FROM scoped_loans WHERE status <> 'paid'
  ),
  scoped_payments AS (
    SELECT p.*
    FROM public.payments p
    JOIN scoped_loans l ON l.id = p.loan_id
    WHERE p.date >= _start AND p.date <= _end
  ),
  -- Rateio principal/juros por contrato (mesma lógica do frontend):
  --   interest_ratio = juros_totais / total_com_juros
  loan_ratio AS (
    SELECT
      l.id,
      CASE
        WHEN COALESCE(l.custom_interest_value, 0) > 0
          THEN COALESCE(l.custom_interest_value, 0)
               / NULLIF(l.amount + COALESCE(l.custom_interest_value, 0), 0)
        WHEN COALESCE(l.interest_rate, 0) > 0 AND COALESCE(l.installments, 0) > 0
          THEN (l.amount * (l.interest_rate/100.0) * l.installments)
               / NULLIF(l.amount * (1 + (l.interest_rate/100.0) * l.installments), 0)
        ELSE 0
      END AS interest_ratio
    FROM scoped_loans l
  ),
  interest_calc AS (
    SELECT
      SUM(
        CASE
          WHEN COALESCE(p.installment_number, 0) <= 0 THEN p.amount
          ELSE p.amount * COALESCE(lr.interest_ratio, 0)
        END
      ) AS interest_received
    FROM scoped_payments p
    LEFT JOIN loan_ratio lr ON lr.id = p.loan_id
  ),
  -- Capital na Rua proporcional (paridade com capitalOnStreet)
  capital_calc AS (
    SELECT COALESCE(SUM(
      l.amount
      * GREATEST(
          0,
          (GREATEST(l.installments, 1)::numeric - LEAST(COALESCE(l.paid_installments, 0), GREATEST(l.installments, 1))::numeric)
          / GREATEST(l.installments, 1)::numeric
        )
    ), 0) AS remaining_capital
    FROM active_loans l
  ),
  -- Overdue por parcela em loan_installments (fallback: due_date do contrato)
  overdue_calc AS (
    SELECT COUNT(*)::bigint AS overdue_count
    FROM active_loans l
    WHERE
      EXISTS (
        SELECT 1 FROM public.loan_installments li
        WHERE li.loan_id = l.id
          AND li.paid = false
          AND li.due_date < CURRENT_DATE
      )
      OR (
        NOT EXISTS (SELECT 1 FROM public.loan_installments li WHERE li.loan_id = l.id)
        AND l.due_date < CURRENT_DATE
      )
  )
  SELECT
    _owner,
    (SELECT COUNT(*) FROM scoped_loans),
    (SELECT COUNT(*) FROM active_loans),
    (SELECT COUNT(*) FROM scoped_loans WHERE status = 'paid'),
    COALESCE((SELECT SUM(amount) FROM scoped_loans), 0),
    COALESCE((SELECT SUM(amount) FROM scoped_loans WHERE start_date BETWEEN _start AND _end), 0),
    COALESCE((SELECT SUM(amount) FROM scoped_payments), 0),
    COALESCE((SELECT interest_received FROM interest_calc), 0),
    (SELECT remaining_capital FROM capital_calc),
    (SELECT overdue_count FROM overdue_calc);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_totals(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_loan_totals(date, date) IS
  'P0-03 Egress: agregados de empréstimos para o Dashboard num único round-trip. Paridade com useDashboardMetrics (capitalOnStreet proporcional, overdue via loan_installments).';
