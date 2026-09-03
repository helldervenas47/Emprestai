-- P0-01b DRY-RUN parte 3/3 — Divergência vs balance atual (bloco 8).
-- Somente SELECT. Rode isoladamente no SQL Editor do Supabase.

-- =============================================================================
-- (8) Divergência estimada vs. saldo atual da tabela balance.
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
  SELECT user_id, SUM(amount) AS oficial_esperado FROM (
    SELECT user_id, amount FROM public.account_ledger
    UNION ALL
    SELECT i.user_id, i.amount FROM public.incomes i
    WHERE i.received_date IS NOT NULL AND i.ledger_id IS NULL
    UNION ALL
    SELECT e.user_id, -e.amount FROM public.expenses e
    WHERE e.paid_date IS NOT NULL AND COALESCE(e.category,'')<>'Cartão de Crédito'
      AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id=e.id)
    UNION ALL
    SELECT user_id, amount FROM sale_items
    UNION ALL
    SELECT ba.owner_id, COALESCE(ba.amount,0)-COALESCE(ba.previous_amount,0)
    FROM public.balance_adjustments ba
    WHERE ba.owner_id IS NOT NULL
      AND COALESCE(ba.amount,0)-COALESCE(ba.previous_amount,0)<>0
  ) x GROUP BY user_id
)
SELECT '8_divergencia'::text AS bloco,
       b.user_id,
       b.amount               AS saldo_app_atual,
       s.oficial_esperado,
       (s.oficial_esperado - b.amount) AS divergencia
FROM public.balance b
LEFT JOIN sim s ON s.user_id=b.user_id
ORDER BY ABS(COALESCE(s.oficial_esperado - b.amount, 0)) DESC NULLS LAST;
