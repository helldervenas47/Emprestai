-- P0-01b DRY-RUN — somente SELECT. Não altera nada.
-- Vendas: usa sales.payment_history (JSONB), 1 linha por item. Não usa public.payments.

\echo '=== (0) Amostra real de payment_history (para conferência de formato) ==='
SELECT id, business_type, jsonb_array_length(payment_history) AS itens, payment_history
  FROM public.sales
 WHERE payment_history IS NOT NULL
   AND jsonb_typeof(payment_history) = 'array'
   AND jsonb_array_length(payment_history) > 0
 ORDER BY created_at DESC NULLS LAST
 LIMIT 5;

\echo '=== (1) Receitas recebidas que entrariam no ledger ==='
SELECT COUNT(*) AS incomes_a_inserir
  FROM public.incomes i
 WHERE i.received_date IS NOT NULL
   AND i.ledger_id IS NULL;

\echo '=== (1b) Incomes já com ledger_id (não reinsere) ==='
SELECT
  COUNT(*) FILTER (WHERE ledger_id IS NOT NULL) AS com_ledger,
  COUNT(*) FILTER (WHERE ledger_id IS NULL AND received_date IS NOT NULL) AS sem_ledger_recebidas,
  COUNT(*) FILTER (WHERE received_date IS NULL) AS nao_recebidas
FROM public.incomes;

\echo '=== (2) Despesas pagas que entrariam no ledger (exclui cartão) ==='
SELECT COUNT(*) AS expenses_a_inserir
  FROM public.expenses e
 WHERE e.paid_date IS NOT NULL
   AND COALESCE(e.category, '') <> 'Cartão de Crédito'
   AND NOT EXISTS (
     SELECT 1 FROM public.account_ledger l
      WHERE l.source = 'expense' AND l.expense_id = e.id
   );

\echo '=== (3) Despesas de cartão excluídas ==='
SELECT COUNT(*) AS expenses_cartao_excluidas
  FROM public.expenses
 WHERE paid_date IS NOT NULL
   AND category = 'Cartão de Crédito';

\echo '=== (3b) Despesas pagas sem payment_method (wallet indefinido) ==='
SELECT COUNT(*) AS expenses_sem_payment_method
  FROM public.expenses e
 WHERE e.paid_date IS NOT NULL
   AND COALESCE(e.category, '') <> 'Cartão de Crédito'
   AND e.payment_method_id IS NULL;

\echo '=== (4) Pagamentos de vendas que entrariam (payment_history, exclui aluguel_veiculo) ==='
WITH itens AS (
  SELECT s.id AS sale_id, s.user_id, s.business_type,
         elem.value AS item, elem.ordinality AS idx
    FROM public.sales s,
         LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
           WITH ORDINALITY AS elem(value, ordinality)
   WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb)) = 'array'
)
SELECT COUNT(*) AS sale_payments_a_inserir
  FROM itens i
 WHERE COALESCE(i.business_type,'') <> 'aluguel_veiculo'
   AND (i.item->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
   AND (i.item->>'amount')::numeric > 0
   AND COALESCE(i.item->>'date','') ~ '^\d{4}-\d{2}-\d{2}'
   AND NOT EXISTS (
     SELECT 1 FROM public.account_ledger l
      WHERE l.user_id = i.user_id
        AND l.source = 'payment'
        AND l.metadata->>'source_kind' = 'sale_payment'
        AND l.metadata->>'sale_id' = i.sale_id::text
        AND l.metadata->>'sale_payment_idx' = i.idx::text
   );

\echo '=== (4b) Vendas de aluguel_veiculo excluídas (itens) ==='
SELECT COUNT(*) AS sale_items_aluguel_excluidos
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
 WHERE s.business_type = 'aluguel_veiculo';

\echo '=== (4c) Itens de venda descartados por amount inválido ==='
SELECT COUNT(*) AS sale_items_amount_invalido
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
 WHERE COALESCE(s.business_type,'') <> 'aluguel_veiculo'
   AND (
        (elem.value->>'amount') IS NULL
     OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
     OR (elem.value->>'amount')::numeric <= 0
   );

\echo '=== (4d) Itens de venda descartados por date inválida ==='
SELECT COUNT(*) AS sale_items_date_invalida
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
 WHERE COALESCE(s.business_type,'') <> 'aluguel_veiculo'
   AND COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}';

\echo '=== (5) Ajustes manuais que entrariam (delta != 0) ==='
SELECT COUNT(*) AS adjustments_a_inserir
  FROM public.balance_adjustments
 WHERE COALESCE(amount,0) - COALESCE(previous_amount,0) <> 0;

\echo '=== (5b) Ledger atual source=adjustment (legado) ==='
SELECT COUNT(*) AS ledger_adjustment_legado
  FROM public.account_ledger
 WHERE source = 'adjustment';

\echo '=== (6) Duplicidades potenciais ==='
SELECT 'expense_id_dup' AS tipo, COUNT(*) AS qtd FROM (
  SELECT expense_id FROM public.account_ledger
   WHERE source = 'expense' AND expense_id IS NOT NULL
   GROUP BY expense_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'sale_payment_dup', COUNT(*) FROM (
  SELECT user_id, metadata->>'sale_id' s, metadata->>'sale_payment_idx' p
    FROM public.account_ledger
   WHERE source='payment'
     AND metadata->>'source_kind' = 'sale_payment'
     AND metadata->>'sale_payment_idx' IS NOT NULL
   GROUP BY 1,2,3 HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'income_ledger_id_orfao', COUNT(*)
  FROM public.incomes i
  LEFT JOIN public.account_ledger l ON l.id = i.ledger_id
 WHERE i.ledger_id IS NOT NULL AND l.id IS NULL
UNION ALL
SELECT 'adjustment_id_dup', COUNT(*) FROM (
  SELECT metadata->>'adjustment_id' a
    FROM public.account_ledger
   WHERE source='adjustment' AND metadata->>'adjustment_id' IS NOT NULL
   GROUP BY 1 HAVING COUNT(*) > 1
) x;

\echo '=== (7) Saldo esperado por usuário APÓS backfill (simulação) ==='
WITH sale_items AS (
  SELECT s.user_id,
         (elem.value->>'amount')::numeric AS amount
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
          AND l.metadata->>'sale_payment_idx' = elem.ordinality::text
     )
),
sim AS (
  SELECT user_id, wallet, amount FROM public.account_ledger
  UNION ALL
  SELECT i.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id = i.payment_method_id), 'account'),
         i.amount
    FROM public.incomes i
   WHERE i.received_date IS NOT NULL AND i.ledger_id IS NULL
  UNION ALL
  SELECT e.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id = e.payment_method_id), 'account'),
         -e.amount
    FROM public.expenses e
   WHERE e.paid_date IS NOT NULL
     AND COALESCE(e.category,'') <> 'Cartão de Crédito'
     AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id = e.id)
  UNION ALL
  SELECT user_id, 'account', amount FROM sale_items
  UNION ALL
  SELECT user_id, 'account', COALESCE(amount,0) - COALESCE(previous_amount,0)
    FROM public.balance_adjustments
   WHERE COALESCE(amount,0) - COALESCE(previous_amount,0) <> 0
)
SELECT user_id,
       SUM(amount) FILTER (WHERE wallet='account') AS saldo_conta_esperado,
       SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_caixa_esperado,
       SUM(amount)                                 AS saldo_total_esperado
  FROM sim
 GROUP BY user_id
 ORDER BY saldo_total_esperado DESC;

\echo '=== (8) Divergência estimada vs. saldo atual da tabela balance ==='
WITH sale_items AS (
  SELECT s.user_id, (elem.value->>'amount')::numeric AS amount
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
          AND l.metadata->>'sale_payment_idx' = elem.ordinality::text
     )
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
      WHERE COALESCE(amount,0)-COALESCE(previous_amount,0) <> 0
  ) x GROUP BY user_id
)
SELECT b.user_id,
       b.amount               AS saldo_app_atual,
       s.oficial_esperado,
       (s.oficial_esperado - b.amount) AS divergencia
  FROM public.balance b
  LEFT JOIN sim s ON s.user_id = b.user_id
 ORDER BY ABS(COALESCE(s.oficial_esperado - b.amount, 0)) DESC;

\echo '=== (9) Registros que ficariam de fora ==='
SELECT 'income_sem_received_date' AS motivo, COUNT(*) AS qtd
  FROM public.incomes WHERE received_date IS NULL
UNION ALL
SELECT 'expense_sem_paid_date', COUNT(*)
  FROM public.expenses WHERE paid_date IS NULL
UNION ALL
SELECT 'expense_cartao', COUNT(*)
  FROM public.expenses WHERE paid_date IS NOT NULL AND category = 'Cartão de Crédito'
UNION ALL
SELECT 'sale_aluguel_veiculo_itens', COUNT(*)
  FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
  WHERE s.business_type = 'aluguel_veiculo'
UNION ALL
SELECT 'sale_item_amount_invalido', COUNT(*)
  FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
  WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
    AND ((elem.value->>'amount') IS NULL
         OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
         OR (elem.value->>'amount')::numeric <= 0)
UNION ALL
SELECT 'sale_item_date_invalida', COUNT(*)
  FROM public.sales s, LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) elem
  WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
    AND COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}'
UNION ALL
SELECT 'adjustment_delta_zero', COUNT(*)
  FROM public.balance_adjustments
  WHERE COALESCE(amount,0)-COALESCE(previous_amount,0) = 0
UNION ALL
SELECT 'expense_pm_kind_invalido', COUNT(*)
  FROM public.expenses e
  LEFT JOIN public.payment_methods pm ON pm.id = e.payment_method_id
  WHERE e.paid_date IS NOT NULL
    AND COALESCE(e.category,'')<>'Cartão de Crédito'
    AND e.payment_method_id IS NOT NULL
    AND pm.kind IS NULL;
