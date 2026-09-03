-- P0-01b AUDITORIA — usuário c4b97354-277c-4eb0-9ad8-702f7a59981c
-- Somente leitura. Objetivo: entender o gap de ~R$ 10.180 (balance > esperado).
-- Rode cada bloco separado no SQL Editor.

-- =============================================================================
-- (A) Saldo atual em `balance` (todas as colunas disponíveis).
-- =============================================================================
SELECT * FROM public.balance
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c';

-- =============================================================================
-- (B) Resumo do ledger atual: por source/direction/wallet.
-- =============================================================================
SELECT source,
       direction,
       COALESCE(wallet,'(null)') AS wallet,
       COUNT(*)                  AS n,
       SUM(amount)               AS total
FROM public.account_ledger
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
GROUP BY source, direction, wallet
ORDER BY source, direction, wallet;

-- =============================================================================
-- (C) Ledger completo (linha a linha) — inspecionar em ordem cronológica.
-- =============================================================================
SELECT id, occurred_on, source, direction, wallet, amount,
       category, description, expense_id, loan_id, payment_id,
       metadata, created_at
FROM public.account_ledger
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY occurred_on, created_at;

-- =============================================================================
-- (D) Incomes — separadas por status (recebida com/sem ledger, pendente).
-- =============================================================================
SELECT
  CASE
    WHEN received_date IS NULL                THEN 'nao_recebida'
    WHEN ledger_id IS NOT NULL                THEN 'recebida_com_ledger'
    ELSE                                            'recebida_sem_ledger'
  END AS status_backfill,
  COUNT(*) AS n,
  SUM(amount) AS total
FROM public.incomes
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
GROUP BY 1
ORDER BY 1;

SELECT id, received_date, actual_received_date, amount, description,
       category, status, ledger_id, payment_method_id, created_at
FROM public.incomes
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY received_date NULLS LAST, created_at;

-- =============================================================================
-- (E) Expenses — separadas por status (paga com/sem ledger, cartão, pendente).
-- =============================================================================
SELECT
  CASE
    WHEN paid_date IS NULL                       THEN 'nao_paga'
    WHEN category = 'Cartão de Crédito'          THEN 'paga_cartao_excluida_backfill'
    WHEN EXISTS (SELECT 1 FROM public.account_ledger l
                 WHERE l.source='expense' AND l.expense_id=e.id) THEN 'paga_com_ledger'
    ELSE                                              'paga_sem_ledger'
  END AS status_backfill,
  COUNT(*) AS n,
  SUM(amount) AS total
FROM public.expenses e
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
GROUP BY 1
ORDER BY 1;

SELECT id, paid_date, due_date, paid, amount, description, category,
       payment_method_id, parent_expense_id, generate_income_on_pay,
       generated_income_id, created_at
FROM public.expenses
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY paid_date NULLS LAST, created_at;

-- =============================================================================
-- (F) Sales — payment_history explodido em itens (mesma regra do backfill).
-- =============================================================================
SELECT s.id, s.business_type, s.created_at,
       elem.ordinality AS item_idx,
       elem.value->>'date'   AS item_date,
       elem.value->>'amount' AS item_amount,
       elem.value->>'method' AS item_method,
       CASE
         WHEN s.business_type='aluguel_veiculo' THEN 'excluido_aluguel'
         WHEN (elem.value->>'amount') IS NULL
              OR (elem.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
              OR (elem.value->>'amount')::numeric <= 0 THEN 'amount_invalido'
         WHEN COALESCE(elem.value->>'date','') !~ '^\d{4}-\d{2}-\d{2}' THEN 'date_invalida'
         WHEN EXISTS (SELECT 1 FROM public.account_ledger l
                      WHERE l.user_id=s.user_id AND l.source='payment'
                        AND l.metadata->>'source_kind'='sale_payment'
                        AND l.metadata->>'sale_id'=s.id::text
                        AND l.metadata->>'sale_payment_idx'=elem.ordinality::text)
              THEN 'ja_no_ledger'
         ELSE 'sera_inserido'
       END AS status_backfill
FROM public.sales s
LEFT JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
              WITH ORDINALITY AS elem(value, ordinality) ON TRUE
WHERE s.user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY s.created_at, elem.ordinality;

-- =============================================================================
-- (G) Balance adjustments do usuário (owner_id).
-- =============================================================================
SELECT id, adjustment_date, amount, previous_amount,
       (amount - previous_amount) AS delta,
       notes, adjusted_by, created_at
FROM public.balance_adjustments
WHERE owner_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY adjustment_date, created_at;

-- =============================================================================
-- (H) Pagamentos de empréstimo (payments) — não entram no ledger de vendas,
--     mas podem afetar `balance` se algum trigger antigo somava aqui.
-- =============================================================================
SELECT p.id, p.date, p.amount, p.installment_number,
       p.loan_id, l.borrower_name, p.created_at
FROM public.payments p
LEFT JOIN public.loans l ON l.id = p.loan_id
WHERE p.user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY p.date, p.created_at;

-- =============================================================================
-- (I) Faturas de cartão e aberturas — possíveis fontes de descompasso.
-- =============================================================================
SELECT id, month_label, credit_card_id, total_amount, paid_amount,
       status, due_date, created_at
FROM public.credit_card_invoices
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY created_at;

SELECT id, month_label, credit_card_id, opening_balance, opening_amount,
       status, created_at
FROM public.credit_card_invoice_openings
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY created_at;

-- =============================================================================
-- (J) Saldo de abertura mensal — se existir, entra no cálculo do `balance`.
-- =============================================================================
SELECT id, month, amount, owner_id, created_at
FROM public.monthly_opening_balances
WHERE user_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
   OR owner_id = 'c4b97354-277c-4eb0-9ad8-702f7a59981c'
ORDER BY month;

-- =============================================================================
-- (K) Reconciliação detalhada: o que o backfill VAI inserir para este usuário.
--     (mesmas regras dos scripts p0_01b_dryrun_supabase_2_saldos.sql)
-- =============================================================================
WITH v_user AS (SELECT 'c4b97354-277c-4eb0-9ad8-702f7a59981c'::uuid AS uid),
sale_items AS (
  SELECT s.id AS sale_id, elem.ordinality AS idx,
         (elem.value->>'amount')::numeric AS amount,
         elem.value->>'date' AS occurred_on
  FROM public.sales s, v_user u,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
         WITH ORDINALITY AS elem(value, ordinality)
  WHERE s.user_id = u.uid
    AND COALESCE(s.business_type,'')<>'aluguel_veiculo'
    AND (elem.value->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (elem.value->>'amount')::numeric > 0
    AND COALESCE(elem.value->>'date','') ~ '^\d{4}-\d{2}-\d{2}'
    AND NOT EXISTS (
      SELECT 1 FROM public.account_ledger l
      WHERE l.user_id = s.user_id AND l.source='payment'
        AND l.metadata->>'source_kind'='sale_payment'
        AND l.metadata->>'sale_id' = s.id::text
        AND l.metadata->>'sale_payment_idx' = elem.ordinality::text)
),
componentes AS (
  SELECT 'ledger_atual'                    AS componente, SUM(amount) AS total
    FROM public.account_ledger, v_user u WHERE account_ledger.user_id=u.uid
  UNION ALL
  SELECT 'incomes_a_inserir',              SUM(i.amount)
    FROM public.incomes i, v_user u
   WHERE i.user_id=u.uid AND i.received_date IS NOT NULL AND i.ledger_id IS NULL
  UNION ALL
  SELECT 'expenses_a_inserir_negativo',    -SUM(e.amount)
    FROM public.expenses e, v_user u
   WHERE e.user_id=u.uid AND e.paid_date IS NOT NULL
     AND COALESCE(e.category,'')<>'Cartão de Crédito'
     AND NOT EXISTS (SELECT 1 FROM public.account_ledger l
                     WHERE l.source='expense' AND l.expense_id=e.id)
  UNION ALL
  SELECT 'sales_a_inserir',                SUM(amount) FROM sale_items
  UNION ALL
  SELECT 'adjustments_a_inserir_delta',    SUM(ba.amount - ba.previous_amount)
    FROM public.balance_adjustments ba, v_user u
   WHERE ba.owner_id = u.uid
     AND COALESCE(ba.amount,0)-COALESCE(ba.previous_amount,0) <> 0
)
SELECT * FROM componentes
UNION ALL
SELECT 'TOTAL_ESPERADO', SUM(total) FROM componentes;
