-- P0-01b RECONCILIAÇÃO — NÃO APLICAR AINDA.
-- Objetivo: recompor `public.balance.amount` a partir do `public.account_ledger`
-- após o backfill. Contém apenas o SELECT de simulação + o UPDATE comentado.
--
-- Regras:
--   * saldo oficial = SUM(account_ledger.amount) por user_id
--     (o ledger já grava despesas como negativas e receitas como positivas).
--   * roda por usuário; NÃO cria/exclui linhas de `balance`.
--   * usuários sem linha em `balance` são reportados no SELECT (D) para revisão.

-- =============================================================================
-- (A) Simulação: novo saldo por usuário a partir do ledger.
-- =============================================================================
WITH ledger_sum AS (
  SELECT user_id, SUM(amount) AS saldo_ledger
  FROM public.account_ledger
  GROUP BY user_id
)
SELECT b.user_id,
       b.amount              AS saldo_balance_atual,
       COALESCE(l.saldo_ledger, 0) AS saldo_ledger_novo,
       COALESCE(l.saldo_ledger, 0) - b.amount AS delta_aplicado
FROM public.balance b
LEFT JOIN ledger_sum l ON l.user_id = b.user_id
ORDER BY ABS(COALESCE(l.saldo_ledger,0) - b.amount) DESC NULLS LAST;

-- =============================================================================
-- (B) Simulação por wallet (caso a UI use `account_amount`/`cash_amount`
--     separadamente na tabela balance).
-- =============================================================================
SELECT user_id,
       SUM(amount) FILTER (WHERE wallet='account') AS saldo_account_novo,
       SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_cash_novo,
       SUM(amount)                                 AS saldo_total_novo
FROM public.account_ledger
GROUP BY user_id
ORDER BY saldo_total_novo DESC NULLS LAST;

-- =============================================================================
-- (C) Usuários no ledger que NÃO têm linha em `balance` (precisariam INSERT).
-- =============================================================================
SELECT l.user_id, SUM(l.amount) AS saldo_ledger
FROM public.account_ledger l
LEFT JOIN public.balance b ON b.user_id = l.user_id
WHERE b.user_id IS NULL
GROUP BY l.user_id
ORDER BY saldo_ledger DESC NULLS LAST;

-- =============================================================================
-- (D) Usuários com `balance` mas SEM linhas no ledger (saldo iria a zero).
-- =============================================================================
SELECT b.user_id, b.amount AS saldo_balance_atual
FROM public.balance b
LEFT JOIN public.account_ledger l ON l.user_id = b.user_id
WHERE l.user_id IS NULL
ORDER BY b.amount DESC NULLS LAST;


-- =============================================================================
-- (E) UPDATE de reconciliação — COMENTADO. Só descomentar depois do backfill,
--     revisar bloco (A), e rodar dentro de BEGIN; ... COMMIT;.
-- =============================================================================
-- BEGIN;
--
-- -- (E.1) Atualiza saldo total (coluna `amount`).
-- UPDATE public.balance b
--    SET amount     = COALESCE(l.saldo_ledger, 0),
--        updated_at = now()
--   FROM (SELECT user_id, SUM(amount) AS saldo_ledger
--           FROM public.account_ledger
--          GROUP BY user_id) l
--  WHERE l.user_id = b.user_id;
--
-- -- (E.2) OPCIONAL: se a tabela `balance` tiver account_amount/cash_amount,
-- --       recompor por wallet a partir do ledger.
-- -- UPDATE public.balance b
-- --    SET account_amount = COALESCE(w.saldo_account, 0),
-- --        cash_amount    = COALESCE(w.saldo_cash, 0),
-- --        updated_at     = now()
-- --   FROM (SELECT user_id,
-- --                SUM(amount) FILTER (WHERE wallet='account') AS saldo_account,
-- --                SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_cash
-- --           FROM public.account_ledger
-- --          GROUP BY user_id) w
-- --  WHERE w.user_id = b.user_id;
--
-- -- (E.3) Verificação pós-UPDATE.
-- SELECT b.user_id, b.amount, SUM(l.amount) AS soma_ledger,
--        (b.amount - SUM(l.amount)) AS diff
--   FROM public.balance b
--   JOIN public.account_ledger l ON l.user_id = b.user_id
--  GROUP BY b.user_id, b.amount
-- HAVING ABS(b.amount - SUM(l.amount)) > 0.01;
--
-- COMMIT;
-- -- ROLLBACK; -- em caso de dúvida
