-- P0-01b DRY-RUN — versão para SQL Editor do Supabase.
-- Somente SELECT. Não altera nada. Sem metacomandos psql.
-- Rode o arquivo inteiro; o editor mostrará um resultado por SELECT.

-- =============================================================================
-- (1) Receitas recebidas que entrariam no ledger + status geral de incomes.
-- =============================================================================
SELECT '1_incomes_a_inserir'          AS bloco, COUNT(*)::text AS valor
FROM public.incomes
WHERE received_date IS NOT NULL AND ledger_id IS NULL
UNION ALL
SELECT '1b_incomes_com_ledger',        COUNT(*)::text
FROM public.incomes WHERE ledger_id IS NOT NULL
UNION ALL
SELECT '1b_incomes_sem_ledger_receb',  COUNT(*)::text
FROM public.incomes WHERE ledger_id IS NULL AND received_date IS NOT NULL
UNION ALL
SELECT '1b_incomes_nao_recebidas',     COUNT(*)::text
FROM public.incomes WHERE received_date IS NULL

-- =============================================================================
-- (2)/(3) Despesas pagas / cartão excluídas / sem payment_method.
-- =============================================================================
UNION ALL
SELECT '2_expenses_a_inserir', COUNT(*)::text
FROM public.expenses e
WHERE e.paid_date IS NOT NULL
  AND COALESCE(e.category,'') <> 'Cartão de Crédito'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_ledger l
    WHERE l.source='expense' AND l.expense_id=e.id)
UNION ALL
SELECT '3_expenses_cartao_excluidas', COUNT(*)::text
FROM public.expenses
WHERE paid_date IS NOT NULL AND category='Cartão de Crédito'
UNION ALL
SELECT '3b_expenses_sem_payment_method', COUNT(*)::text
FROM public.expenses e
WHERE e.paid_date IS NOT NULL
  AND COALESCE(e.category,'')<>'Cartão de Crédito'
  AND e.payment_method_id IS NULL

-- =============================================================================
-- (4) Pagamentos de vendas via sales.payment_history (JSONB, 1 linha por item).
--     Exclui business_type='aluguel_veiculo'. Valida amount e date.
-- =============================================================================
UNION ALL
SELECT '4_sale_payments_a_inserir', COUNT(*)::text
FROM public.sales s,
     LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
       WITH ORDINALITY AS elem(value, ordinality)
WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb)) = 'array'
  AND COALESCE(s.business_type,'') <> 'aluguel_veiculo'
  AND (elem.value->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND (elem.value->>'amount')::numeric > 0
  AND COALESCE(elem.value->>'date','') ~ '^\d{4}-\d{2}-\d{2}'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_ledger l
    WHERE l.user_id = s.user_id
      AND l.source = 'payment'
      AND l.metadata->>'source_kind' = 'sale_payment'
      AND l.metadata->>'sale_id' = s.id::text
      AND l.metadata->>'sale_payment_idx' = elem.ordinality::text)
UNION ALL
SELECT '4b_sale_aluguel_excluidos_itens', COUNT(*)::text
FROM public.sales s,
     LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE s.business_type='aluguel_veiculo'
UNION ALL
SELECT '4c_sale_items_amount_invalido', COUNT(*)::text
FROM public.sales s,
     LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND ((elem.value->>'amount') IS NULL
       OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
       OR (elem.value->>'amount')::numeric <= 0)
UNION ALL
SELECT '4d_sale_items_date_invalida', COUNT(*)::text
FROM public.sales s,
     LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}'

-- =============================================================================
-- (5) Ajustes manuais (delta != 0) + ledger legado source=adjustment.
-- =============================================================================
UNION ALL
SELECT '5_adjustments_a_inserir', COUNT(*)::text
FROM public.balance_adjustments
WHERE COALESCE(amount,0)-COALESCE(previous_amount,0) <> 0
UNION ALL
SELECT '5b_ledger_adjustment_legado', COUNT(*)::text
FROM public.account_ledger WHERE source='adjustment'

-- =============================================================================
-- (6) Duplicidades potenciais.
-- =============================================================================
UNION ALL
SELECT '6_expense_id_dup', COUNT(*)::text FROM (
  SELECT expense_id FROM public.account_ledger
  WHERE source='expense' AND expense_id IS NOT NULL
  GROUP BY expense_id HAVING COUNT(*)>1) x
UNION ALL
SELECT '6_sale_payment_dup', COUNT(*)::text FROM (
  SELECT user_id, metadata->>'sale_id' s, metadata->>'sale_payment_idx' p
  FROM public.account_ledger
  WHERE source='payment'
    AND metadata->>'source_kind'='sale_payment'
    AND metadata->>'sale_payment_idx' IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*)>1) x
UNION ALL
SELECT '6_income_ledger_id_orfao', COUNT(*)::text
FROM public.incomes i
LEFT JOIN public.account_ledger l ON l.id=i.ledger_id
WHERE i.ledger_id IS NOT NULL AND l.id IS NULL
UNION ALL
SELECT '6_adjustment_id_dup', COUNT(*)::text FROM (
  SELECT metadata->>'adjustment_id' a FROM public.account_ledger
  WHERE source='adjustment' AND metadata->>'adjustment_id' IS NOT NULL
  GROUP BY 1 HAVING COUNT(*)>1) x

-- =============================================================================
-- (9) Descartes.
-- =============================================================================
UNION ALL
SELECT '9_income_sem_received_date', COUNT(*)::text
FROM public.incomes WHERE received_date IS NULL
UNION ALL
SELECT '9_expense_sem_paid_date', COUNT(*)::text
FROM public.expenses WHERE paid_date IS NULL
UNION ALL
SELECT '9_expense_cartao', COUNT(*)::text
FROM public.expenses WHERE paid_date IS NOT NULL AND category='Cartão de Crédito'
UNION ALL
SELECT '9_sale_aluguel_itens', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE s.business_type='aluguel_veiculo'
UNION ALL
SELECT '9_sale_item_amount_invalido', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND ((elem.value->>'amount') IS NULL
       OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
       OR (elem.value->>'amount')::numeric <= 0)
UNION ALL
SELECT '9_sale_item_date_invalida', COUNT(*)::text
FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
  AND COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}'
UNION ALL
SELECT '9_adjustment_delta_zero', COUNT(*)::text
FROM public.balance_adjustments
WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)=0
UNION ALL
SELECT '9_expense_pm_kind_invalido', COUNT(*)::text
FROM public.expenses e
LEFT JOIN public.payment_methods pm ON pm.id=e.payment_method_id
WHERE e.paid_date IS NOT NULL
  AND COALESCE(e.category,'')<>'Cartão de Crédito'
  AND e.payment_method_id IS NOT NULL
  AND pm.kind IS NULL
ORDER BY bloco;


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
  SELECT user_id,'account',COALESCE(amount,0)-COALESCE(previous_amount,0)
  FROM public.balance_adjustments
  WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)<>0
)
SELECT '7_saldo_esperado'::text AS bloco,
       user_id,
       SUM(amount) FILTER (WHERE wallet='account') AS saldo_conta_esperado,
       SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_caixa_esperado,
       SUM(amount)                                 AS saldo_total_esperado
FROM sim
GROUP BY user_id
ORDER BY saldo_total_esperado DESC NULLS LAST;


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
    SELECT user_id, COALESCE(amount,0)-COALESCE(previous_amount,0)
    FROM public.balance_adjustments
    WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)<>0
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
