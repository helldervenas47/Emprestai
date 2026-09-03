-- P0-01b DRY-RUN (versão SQL puro, sem \echo). Somente SELECT.

-- (1) incomes_a_inserir
SELECT '1_incomes_a_inserir' AS bloco, COUNT(*)::text AS valor
FROM public.incomes WHERE received_date IS NOT NULL AND ledger_id IS NULL
UNION ALL
-- (1b) incomes status
SELECT '1b_incomes_com_ledger',      COUNT(*)::text FROM public.incomes WHERE ledger_id IS NOT NULL
UNION ALL
SELECT '1b_incomes_sem_ledger_receb',COUNT(*)::text FROM public.incomes WHERE ledger_id IS NULL AND received_date IS NOT NULL
UNION ALL
SELECT '1b_incomes_nao_recebidas',   COUNT(*)::text FROM public.incomes WHERE received_date IS NULL
UNION ALL
-- (2) expenses_a_inserir
SELECT '2_expenses_a_inserir', COUNT(*)::text
FROM public.expenses e
WHERE e.paid_date IS NOT NULL
  AND COALESCE(e.category,'') <> 'Cartão de Crédito'
  AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id=e.id)
UNION ALL
-- (3) expenses_cartao_excluidas
SELECT '3_expenses_cartao_excluidas', COUNT(*)::text
FROM public.expenses WHERE paid_date IS NOT NULL AND category='Cartão de Crédito'
UNION ALL
-- (3b) expenses sem payment_method
SELECT '3b_expenses_sem_pm', COUNT(*)::text
FROM public.expenses e
WHERE e.paid_date IS NOT NULL AND COALESCE(e.category,'')<>'Cartão de Crédito' AND e.payment_method_id IS NULL
UNION ALL
-- (4) sale_payments_a_inserir (via payment_history)
SELECT '4_sale_payments_a_inserir', COUNT(*)::text
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
    WHERE l.user_id=s.user_id
      AND l.source='payment'
      AND l.metadata->>'source_kind'='sale_payment'
      AND l.metadata->>'sale_id'=s.id::text
      AND l.metadata->>'sale_payment_idx'=elem.ordinality::text)
UNION ALL
-- (4b) sales aluguel excluidas (itens)
SELECT '4b_sale_aluguel_excluidos', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE s.business_type='aluguel_veiculo'
UNION ALL
-- (4c) itens com amount inválido
SELECT '4c_sale_items_amount_invalido', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND ((elem.value->>'amount') IS NULL
       OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
       OR (elem.value->>'amount')::numeric <= 0)
UNION ALL
-- (4d) itens com date inválida
SELECT '4d_sale_items_date_invalida', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}'
UNION ALL
-- (5) adjustments a inserir
SELECT '5_adjustments_a_inserir', COUNT(*)::text
FROM public.balance_adjustments WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)<>0
UNION ALL
-- (5b) ledger legado adjustments
SELECT '5b_ledger_adjustment_legado', COUNT(*)::text
FROM public.account_ledger WHERE source='adjustment'
UNION ALL
-- (6) duplicidades
SELECT '6_expense_id_dup', COUNT(*)::text FROM (
  SELECT expense_id FROM public.account_ledger
  WHERE source='expense' AND expense_id IS NOT NULL
  GROUP BY expense_id HAVING COUNT(*)>1) x
UNION ALL
SELECT '6_sale_payment_dup', COUNT(*)::text FROM (
  SELECT user_id, metadata->>'sale_id' s, metadata->>'sale_payment_idx' p
  FROM public.account_ledger WHERE metadata->>'sale_payment_idx' IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*)>1) x
UNION ALL
SELECT '6_income_ledger_id_orfao', COUNT(*)::text
FROM public.incomes i LEFT JOIN public.account_ledger l ON l.id=i.ledger_id
WHERE i.ledger_id IS NOT NULL AND l.id IS NULL
UNION ALL
SELECT '6_adjustment_id_dup', COUNT(*)::text FROM (
  SELECT metadata->>'adjustment_id' a FROM public.account_ledger
  WHERE source='adjustment' AND metadata->>'adjustment_id' IS NOT NULL
  GROUP BY 1 HAVING COUNT(*)>1) x
UNION ALL
-- (9) descartes
SELECT '9_income_sem_received_date', COUNT(*)::text FROM public.incomes WHERE received_date IS NULL
UNION ALL
SELECT '9_expense_sem_paid_date', COUNT(*)::text FROM public.expenses WHERE paid_date IS NULL
UNION ALL
SELECT '9_expense_cartao', COUNT(*)::text FROM public.expenses WHERE paid_date IS NOT NULL AND category='Cartão de Crédito'
UNION ALL
SELECT '9_sale_aluguel', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE s.business_type='aluguel_veiculo'
UNION ALL
SELECT '9_adjustment_delta_zero', COUNT(*)::text
FROM public.balance_adjustments WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)=0
UNION ALL
SELECT '9_expense_pm_kind_invalido', COUNT(*)::text
FROM public.expenses e LEFT JOIN public.payment_methods pm ON pm.id=e.payment_method_id
WHERE e.paid_date IS NOT NULL AND COALESCE(e.category,'')<>'Cartão de Crédito'
  AND e.payment_method_id IS NOT NULL AND pm.kind IS NULL
ORDER BY bloco;
