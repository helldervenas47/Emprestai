-- P0-01b DRY-RUN parte 2/3 — Saldo esperado por usuário (bloco 7).
-- Somente SELECT. Rode isoladamente no SQL Editor do Supabase.

-- =============================================================================
-- (7) Saldo esperado por usuário APÓS backfill (simulação). Uma linha por user.
-- =============================================================================
WITH sale_items AS (
  SELECT s.user_id, (elem.value->>'amount')::numeric AS amount
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
         WITH ORDINALITY AS elem(value, ordinality)
  WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb))='array'
    AND COALESCE(s.business_type,'')<>'aluguel_veiculo'
    AND (elem.value->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (elem.value->>'amount')::numeric > 0
    AND COALESCE(elem.value->>'date','') ~ '^\d{4}-\d{2}-\d{2}'
    AND NOT EXISTS (
      SELECT 1 FROM public.account_ledger l
      WHERE l.user_id=s.user_id AND l.source='payment'
        AND l.metadata->>'source_kind'='sale_payment'
        AND l.metadata->>'sale_id'=s.id::text
        AND l.metadata->>'sale_payment_idx'=elem.ordinality::text)
),
sim AS (
  SELECT user_id, wallet, amount FROM public.account_ledger
  UNION ALL
  SELECT i.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id=i.payment_method_id),'account'),
         i.amount
  FROM public.incomes i
  WHERE i.received_date IS NOT NULL AND i.ledger_id IS NULL
  UNION ALL
  SELECT e.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id=e.payment_method_id),'account'),
         -e.amount
  FROM public.expenses e
  WHERE e.paid_date IS NOT NULL
    AND COALESCE(e.category,'')<>'Cartão de Crédito'
    AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id=e.id)
  UNION ALL
  SELECT user_id,'account',amount FROM sale_items
  UNION ALL
  SELECT ba.owner_id,'account',COALESCE(ba.amount,0)-COALESCE(ba.previous_amount,0)
  FROM public.balance_adjustments ba
  WHERE ba.owner_id IS NOT NULL
    AND COALESCE(ba.amount,0)-COALESCE(ba.previous_amount,0)<>0
)
SELECT '7_saldo_esperado'::text AS bloco,
       user_id,
       SUM(amount) FILTER (WHERE wallet='account') AS saldo_conta_esperado,
       SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_caixa_esperado,
       SUM(amount)                                 AS saldo_total_esperado
FROM sim
GROUP BY user_id
ORDER BY saldo_total_esperado DESC NULLS LAST;

