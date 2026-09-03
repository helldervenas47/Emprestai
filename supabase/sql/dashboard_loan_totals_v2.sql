-- =====================================================================
-- Dashboard · Cards de Empréstimos — agregação server-side (redução de egress)
-- Aplicar no SQL Editor do Supabase do projeto (banco próprio).
--
-- Substitui o download completo de loans + payments + loan_installments
-- por UMA chamada RPC que devolve UMA linha agregada.
--
-- PARIDADE COM O FRONTEND (não alterar aqui sem alterar lá):
--   * capital_ativo      = useDashboardMetrics.portfolio.capitalOnStreet
--                          Σ amount * (installments - paid_installments)/installments
--                          (contratos status <> 'paid')
--   * receber            = Σ getLoanReceivable(loan)  (loanLateFees.ts)
--                          base = remaining_amount (se > 0)
--                                 senão Σ parcelas não pagas (installments >= 2)
--                                 senão max(0, round(amount*(1+rate/100)) - pago)
--                          + juros/multa de atraso (1ª parcela pendente vencida)
--                          + renegotiation_penalty_total (só parcela única)
--   * multas_pendentes   = parte de encargos por atraso + multa de renegociação
--   * juros_receber      = receber - capital_ativo      (regra oficial do app)
--   * juros_recebidos    = pagamentos do período rateados pela razão de juros
--                          (installment_number <= 0 => 100% juros)
--   * principal_recebido = total recebido no período - juros_recebidos
--   * taxa_juros_media   = média ponderada IGNORANDO contratos com taxa 0%
--
-- Segurança: SECURITY DEFINER + search_path fixo. Escopo obrigatório por
-- public.get_data_owner_id(auth.uid()) — nunca por parâmetro do cliente.
-- =====================================================================

DROP FUNCTION IF EXISTS public.dashboard_loan_totals(date, date);

CREATE OR REPLACE FUNCTION public.dashboard_loan_totals(
  _start date,
  _end   date
)
RETURNS TABLE(
  owner_id                uuid,
  emprestado              numeric,  -- Σ loans.amount no período [_start,_end]
  emprestado_total        numeric,  -- Σ loans.amount (histórico completo)
  receber                 numeric,  -- Σ receivable dos contratos ativos
  principal_recebido      numeric,  -- recebido no período - juros do período
  juros_recebidos         numeric,  -- juros alocados aos pagamentos do período
  juros_receber           numeric,  -- receber - capital_ativo
  multas_pendentes        numeric,  -- encargos de atraso + multa de renegociação
  capital_ativo           numeric,  -- capital na rua (principal proporcional)
  total_recebido_periodo  numeric,  -- Σ payments.amount no período
  quantidade_contratos    bigint,
  contratos_ativos        bigint,
  contratos_quitados      bigint,
  contratos_parcelados    bigint,
  contratos_atrasados     bigint,
  taxa_juros_media        numeric   -- % média ponderada (exclui taxa 0%)
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
  WITH l AS (
    SELECT
      lo.id,
      COALESCE(lo.amount, 0)::numeric                AS amount,
      COALESCE(lo.interest_rate, 0)::numeric         AS interest_rate,
      GREATEST(COALESCE(lo.installments, 1), 1)      AS installments,
      COALESCE(lo.paid_installments, 0)              AS paid_installments,
      lo.status,
      lo.start_date,
      lo.due_date,
      COALESCE(lo.remaining_amount, 0)::numeric      AS remaining_amount,
      lo.late_interest_type,
      COALESCE(lo.late_interest_value, 0)::numeric   AS late_interest_value,
      COALESCE(lo.penalty_value, 0)::numeric         AS penalty_value,
      COALESCE(lo.custom_interest_value, 0)::numeric AS custom_interest_value,
      COALESCE(lo.renegotiation_penalty_total, 0)::numeric AS reneg_penalty
    FROM public.loans lo
    WHERE lo.user_id = _owner
  ),
  paid_by_loan AS (
    SELECT p.loan_id, COALESCE(SUM(p.amount), 0)::numeric AS total_paid
    FROM public.payments p
    JOIN l ON l.id = p.loan_id
    GROUP BY p.loan_id
  ),
  -- Soma das parcelas ainda não pagas (paridade: getBaseRemainingAmount)
  unpaid_sched AS (
    SELECT li.loan_id, COALESCE(SUM(li.amount), 0)::numeric AS unpaid_total
    FROM public.loan_installments li
    JOIN l ON l.id = li.loan_id
    WHERE li.installment_number > l.paid_installments
    GROUP BY li.loan_id
  ),
  -- Vencimento da 1ª parcela pendente (fallback: loans.due_date)
  first_pending AS (
    SELECT l.id AS loan_id,
      COALESCE(
        (SELECT li.due_date FROM public.loan_installments li
          WHERE li.loan_id = l.id
            AND li.installment_number = l.paid_installments + 1
          LIMIT 1),
        l.due_date
      ) AS due_date
    FROM l
  ),
  base AS (
    SELECT
      l.*,
      COALESCE(pb.total_paid, 0) AS total_paid,
      fp.due_date AS pending_due_date,
      CASE
        WHEN l.remaining_amount > 0 THEN l.remaining_amount
        WHEN l.installments >= 2 AND COALESCE(us.unpaid_total, 0) > 0 THEN us.unpaid_total
        ELSE GREATEST(
          0,
          ROUND(l.amount * (1 + l.interest_rate / 100.0)) - COALESCE(pb.total_paid, 0)
        )
      END AS base_remaining
    FROM l
    LEFT JOIN paid_by_loan pb ON pb.loan_id = l.id
    LEFT JOIN unpaid_sched  us ON us.loan_id = l.id
    LEFT JOIN first_pending fp ON fp.loan_id = l.id
  ),
  fees AS (
    SELECT
      b.*,
      CASE
        WHEN b.status = 'paid' OR b.pending_due_date IS NULL THEN 0
        ELSE GREATEST(0, (CURRENT_DATE - b.pending_due_date))
      END AS days_overdue
    FROM base b
  ),
  loan_calc AS (
    SELECT
      f.*,
      CASE
        WHEN f.days_overdue > 0 AND f.late_interest_value > 0 THEN
          CASE WHEN f.late_interest_type = 'fixed'
            THEN f.late_interest_value * f.days_overdue
            ELSE f.base_remaining * (f.late_interest_value / 100.0) * f.days_overdue
          END
        ELSE 0
      END
      + CASE WHEN f.days_overdue > 0 AND f.penalty_value > 0 THEN f.penalty_value ELSE 0 END
      + CASE WHEN f.installments < 2 THEN f.reneg_penalty ELSE 0 END AS fees_total
    FROM fees f
  ),
  -- Razão de juros por contrato (rateio principal x juros dos pagamentos)
  ratio AS (
    SELECT
      l.id,
      CASE
        WHEN l.custom_interest_value > 0
          THEN l.custom_interest_value / NULLIF(l.amount + l.custom_interest_value, 0)
        WHEN l.interest_rate > 0 AND l.installments > 0
          THEN (l.amount * (l.interest_rate / 100.0) * l.installments)
               / NULLIF(l.amount * (1 + (l.interest_rate / 100.0) * l.installments), 0)
        ELSE 0
      END AS interest_ratio
    FROM l
  ),
  period_payments AS (
    SELECT p.loan_id, p.amount::numeric AS amount, p.installment_number
    FROM public.payments p
    JOIN l ON l.id = p.loan_id
    WHERE p.date >= _start AND p.date <= _end
  ),
  received AS (
    SELECT
      COALESCE(SUM(pp.amount), 0)::numeric AS total_recebido,
      COALESCE(SUM(
        CASE WHEN COALESCE(pp.installment_number, 0) <= 0
          THEN pp.amount
          ELSE pp.amount * COALESCE(r.interest_ratio, 0)
        END
      ), 0)::numeric AS juros_recebidos
    FROM period_payments pp
    LEFT JOIN ratio r ON r.id = pp.loan_id
  ),
  agg AS (
    SELECT
      COALESCE(SUM(lc.amount) FILTER (
        WHERE lc.start_date >= _start AND lc.start_date <= _end
      ), 0)::numeric AS emprestado,
      COALESCE(SUM(lc.amount), 0)::numeric AS emprestado_total,
      COALESCE(SUM(
        CASE WHEN lc.status <> 'paid'
          THEN GREATEST(0, lc.base_remaining + lc.fees_total)
          ELSE 0 END
      ), 0)::numeric AS receber,
      COALESCE(SUM(
        CASE WHEN lc.status <> 'paid' THEN GREATEST(0, lc.fees_total) ELSE 0 END
      ), 0)::numeric AS multas_pendentes,
      COALESCE(SUM(
        CASE WHEN lc.status <> 'paid'
          THEN lc.amount * GREATEST(
                 0,
                 (lc.installments::numeric - LEAST(lc.paid_installments, lc.installments)::numeric)
                 / lc.installments::numeric)
          ELSE 0 END
      ), 0)::numeric AS capital_ativo,
      COUNT(*)::bigint AS quantidade_contratos,
      COUNT(*) FILTER (WHERE lc.status <> 'paid')::bigint AS contratos_ativos,
      COUNT(*) FILTER (WHERE lc.status = 'paid')::bigint  AS contratos_quitados,
      COUNT(*) FILTER (WHERE lc.installments >= 2)::bigint AS contratos_parcelados,
      COUNT(*) FILTER (WHERE lc.status <> 'paid' AND lc.days_overdue > 0)::bigint AS contratos_atrasados,
      -- Taxa média ponderada: contratos com taxa 0% são ignorados
      CASE
        WHEN COALESCE(SUM(lc.amount) FILTER (WHERE lc.interest_rate > 0), 0) > 0
          THEN ROUND(
            SUM(lc.amount * lc.interest_rate) FILTER (WHERE lc.interest_rate > 0)
            / SUM(lc.amount) FILTER (WHERE lc.interest_rate > 0), 4)
        ELSE 0
      END AS taxa_juros_media
    FROM loan_calc lc
  )
  SELECT
    _owner,
    ROUND(a.emprestado, 2),
    ROUND(a.emprestado_total, 2),
    ROUND(a.receber, 2),
    ROUND(GREATEST(0, rc.total_recebido - rc.juros_recebidos), 2),
    ROUND(rc.juros_recebidos, 2),
    ROUND(GREATEST(0, a.receber - a.capital_ativo), 2),
    ROUND(a.multas_pendentes, 2),
    ROUND(a.capital_ativo, 2),
    ROUND(rc.total_recebido, 2),
    a.quantidade_contratos,
    a.contratos_ativos,
    a.contratos_quitados,
    a.contratos_parcelados,
    a.contratos_atrasados,
    a.taxa_juros_media
  FROM agg a CROSS JOIN received rc;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_totals(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_loan_totals(date, date) IS
  'Dashboard: totais agregados dos cards de empréstimos em um único round-trip. Escopo por get_data_owner_id(auth.uid()). Paridade com useDashboardMetrics/loanLateFees.';
