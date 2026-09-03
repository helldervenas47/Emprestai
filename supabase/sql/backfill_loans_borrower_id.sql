-- ============================================================================
-- Backfill de loans.borrower_id
-- ----------------------------------------------------------------------------
-- Objetivo: preencher `loans.borrower_id` (NULL) casando `loans.borrower_name`
-- com `clients.name` do MESMO `user_id`, comparando de forma case/acento
-- insensitive. Só atualiza quando existe EXATAMENTE UM cliente candidato
-- (evita colisão por homônimo). Idempotente — pode rodar de novo sem efeito.
--
-- Como usar (Supabase → SQL Editor, projeto syyxnqzxqabeuqbuptkh):
--   1) Rode a seção [PREVIEW] e confira as linhas.
--   2) Se estiver ok, rode a seção [APPLY] (envolvida em transação).
--   3) Rode a seção [VERIFY] para conferir o resultado.
-- ============================================================================

-- Requer extensão unaccent (padrão no Supabase).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------- [PREVIEW] ------------------------------------------------------
-- Mostra o que SERIA atualizado, sem alterar nada.
WITH candidates AS (
  SELECT
    l.id            AS loan_id,
    l.user_id,
    l.borrower_name,
    c.id            AS client_id,
    c.name          AS client_name,
    COUNT(*) OVER (PARTITION BY l.id) AS n_matches
  FROM public.loans l
  JOIN public.clients c
    ON c.user_id = l.user_id
   AND lower(unaccent(btrim(c.name))) = lower(unaccent(btrim(l.borrower_name)))
  WHERE l.borrower_id IS NULL
    AND l.borrower_name IS NOT NULL
    AND btrim(l.borrower_name) <> ''
)
SELECT loan_id, user_id, borrower_name, client_id, client_name
FROM candidates
WHERE n_matches = 1
ORDER BY user_id, client_name;

-- Linhas que NÃO serão tocadas por ambiguidade (homônimos no mesmo user):
WITH candidates AS (
  SELECT
    l.id AS loan_id, l.user_id, l.borrower_name,
    c.id AS client_id, c.name AS client_name,
    COUNT(*) OVER (PARTITION BY l.id) AS n_matches
  FROM public.loans l
  JOIN public.clients c
    ON c.user_id = l.user_id
   AND lower(unaccent(btrim(c.name))) = lower(unaccent(btrim(l.borrower_name)))
  WHERE l.borrower_id IS NULL
)
SELECT loan_id, borrower_name, array_agg(client_id) AS client_ids
FROM candidates
WHERE n_matches > 1
GROUP BY loan_id, borrower_name;


-- ---------- [APPLY] -------------------------------------------------------
-- Só rode depois de conferir o PREVIEW.
BEGIN;

WITH candidates AS (
  SELECT
    l.id AS loan_id,
    c.id AS client_id,
    COUNT(*) OVER (PARTITION BY l.id) AS n_matches
  FROM public.loans l
  JOIN public.clients c
    ON c.user_id = l.user_id
   AND lower(unaccent(btrim(c.name))) = lower(unaccent(btrim(l.borrower_name)))
  WHERE l.borrower_id IS NULL
    AND l.borrower_name IS NOT NULL
    AND btrim(l.borrower_name) <> ''
),
to_update AS (
  SELECT loan_id, client_id
  FROM candidates
  WHERE n_matches = 1
)
UPDATE public.loans l
SET borrower_id = t.client_id
FROM to_update t
WHERE l.id = t.loan_id
  AND l.borrower_id IS NULL;   -- guarda idempotente

-- Se o número acima parecer errado, dê ROLLBACK; em vez de COMMIT.
COMMIT;


-- ---------- [VERIFY] ------------------------------------------------------
-- Contagens antes/depois:
SELECT
  COUNT(*) FILTER (WHERE borrower_id IS NULL)     AS ainda_sem_borrower_id,
  COUNT(*) FILTER (WHERE borrower_id IS NOT NULL) AS com_borrower_id,
  COUNT(*)                                        AS total_loans
FROM public.loans;

-- Contratos ativos que continuam sem borrower_id (revisar manualmente):
SELECT l.id, l.user_id, l.borrower_name, l.amount, l.status
FROM public.loans l
WHERE l.borrower_id IS NULL
  AND l.status <> 'paid'
ORDER BY l.user_id, l.borrower_name;
