-- =============================================================================
-- P0-01b — Backfill + triggers do `account_ledger`  (REV 3 — schema real)
-- =============================================================================
-- Baseado no schema confirmado do Supabase externo:
--   * account_ledger(user_id, direction, category, amount, occurred_on TEXT,
--                    description, source, metadata jsonb, wallet, expense_id,
--                    payment_method_id, ...) — todas NOT NULL exceto FKs.
--   * expenses(id, user_id, amount, paid, paid_date TEXT, due_date TEXT,
--              category TEXT, scope TEXT, description TEXT, payment_method_id).
--       Cartão de crédito → category = 'Cartão de Crédito' (valor canônico).
--       Veículo → PENDÊNCIA P0-01d (sem coluna dedicada; não marcamos scope).
--   * incomes(id, user_id, amount, status, received_date DATE,
--             actual_received_date DATE, description, category, ledger_id).
--       Idempotência = incomes.ledger_id IS NULL.
--   * sales(id, user_id, business_type, payment_history jsonb).
--       payment_history item: { date, type, amount, ... }.
--       Aluguel de veículo → business_type = 'aluguel_veiculo'.
--   * payment_methods.kind ∈ {'account','cash'} → wallet do lançamento.
--
-- Convenções reutilizadas do ledger existente:
--   source ∈ {'expense','payment','loan','transfer','adjustment','initial'}
--   wallet ∈ {'account','cash'}
--   category = categoria real da origem (não inventamos valores novos).
-- =============================================================================


BEGIN;

-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT — aborta a transação se o schema não bate.
-- -----------------------------------------------------------------------------
DO $$
DECLARE missing text := '';
BEGIN
  FOR chk IN
    SELECT * FROM (VALUES
      ('account_ledger','user_id'),('account_ledger','direction'),
      ('account_ledger','category'),('account_ledger','amount'),
      ('account_ledger','occurred_on'),('account_ledger','description'),
      ('account_ledger','source'),('account_ledger','metadata'),
      ('account_ledger','wallet'),('account_ledger','expense_id'),
      ('incomes','ledger_id'),('incomes','status'),('incomes','received_date'),
      ('expenses','paid'),('expenses','paid_date'),('expenses','category'),
      ('sales','payment_history'),('sales','business_type')
    ) AS t(tbl,col)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public'
                      AND table_name=chk.tbl AND column_name=chk.col) THEN
      missing := missing || chk.tbl || '.' || chk.col || ' ';
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'Colunas ausentes: %', missing;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Índices de idempotência.
--    (a) Expenses: um único lançamento 'expense' por expense_id.
--    (b) Sales: um único 'sale_payment' por par sale_id+índice via metadata.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_expense_uidx
  ON public.account_ledger (expense_id)
  WHERE expense_id IS NOT NULL AND source = 'expense';

CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_sale_payment_uidx
  ON public.account_ledger (
    user_id,
    ((metadata->>'sale_id')),
    ((metadata->>'sale_payment_idx'))
  )
  WHERE source = 'payment'
    AND metadata ? 'sale_id'
    AND metadata ? 'sale_payment_idx';


-- -----------------------------------------------------------------------------
-- 2. Helpers.
-- -----------------------------------------------------------------------------

-- Cartão de crédito por valor canônico (sem heurística de texto):
CREATE OR REPLACE FUNCTION public.is_credit_card_expense(_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _category = 'Cartão de Crédito'
$$;

-- Wallet a partir do payment_method (fallback 'account'):
CREATE OR REPLACE FUNCTION public.ledger_wallet(_payment_method_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT kind FROM public.payment_methods
      WHERE id = _payment_method_id AND kind IN ('account','cash')),
    'account'
  )
$$;


-- -----------------------------------------------------------------------------
-- 3. BACKFILL — despesas pagas (exceto cartão de crédito).
--    Chave de idempotência: expense_id (coluna real).
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger
  (user_id, direction, category, amount, occurred_on, description,
   source, metadata, wallet, expense_id, payment_method_id, created_at, updated_at)
SELECT
  e.user_id,
  'out',
  e.category,
  e.amount,
  COALESCE(NULLIF(e.paid_date,''), NULLIF(e.due_date,''), to_char(now(),'YYYY-MM-DD')),
  COALESCE(NULLIF(e.description,''), e.category),
  'expense',
  jsonb_build_object(
    'backfill', true,
    'source_kind','expense',
    'scope', e.scope,
    'type', e.type
  ),
  public.ledger_wallet(e.payment_method_id),
  e.id,
  e.payment_method_id,
  now(), now()
  FROM public.expenses e
 WHERE e.paid = true
   AND e.amount IS NOT NULL AND e.amount <> 0
   AND (e.scope IS NULL OR e.scope = 'personal')
   AND NOT public.is_credit_card_expense(e.category)
   AND NOT EXISTS (
         SELECT 1 FROM public.account_ledger l
          WHERE l.expense_id = e.id AND l.source = 'expense'
       );


-- -----------------------------------------------------------------------------
-- 4. BACKFILL — receitas recebidas.
--    Chave de idempotência: incomes.ledger_id IS NULL.
--    Preenche incomes.ledger_id de volta com o id gerado.
-- -----------------------------------------------------------------------------
WITH inserted AS (
  INSERT INTO public.account_ledger
    (user_id, direction, category, amount, occurred_on, description,
     source, metadata, wallet, payment_method_id, created_at, updated_at)
  SELECT
    i.user_id, 'in',
    COALESCE(i.category, 'income'),
    i.amount,
    to_char(COALESCE(i.actual_received_date, i.received_date), 'YYYY-MM-DD'),
    COALESCE(NULLIF(i.description,''), COALESCE(i.category,'Receita')),
    'payment',
    jsonb_build_object(
      'backfill', true,
      'source_kind','income',
      'income_id', i.id
    ),
    public.ledger_wallet(i.payment_method_id),
    i.payment_method_id,
    now(), now()
    FROM public.incomes i
   WHERE i.status = 'received'
     AND i.ledger_id IS NULL
     AND i.amount IS NOT NULL AND i.amount <> 0
  RETURNING id, (metadata->>'income_id')::uuid AS income_id
)
UPDATE public.incomes i
   SET ledger_id = ins.id
  FROM inserted ins
 WHERE i.id = ins.income_id;


-- -----------------------------------------------------------------------------
-- 5. BACKFILL — vendas recebidas (payment_history[]).
--    Não afeta 'aluguel_veiculo' (regra atual: fica no saldo de veículos).
--    Chave de idempotência: índice único parcial em (sale_id, sale_payment_idx).
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger
  (user_id, direction, category, amount, occurred_on, description,
   source, metadata, wallet, created_at, updated_at)
SELECT
  s.user_id, 'in',
  COALESCE(s.category, 'sale'),
  (elem.value->>'amount')::numeric,
  COALESCE(
    NULLIF(elem.value->>'date',''),
    NULLIF(s.sale_date,''),
    to_char(now(),'YYYY-MM-DD')
  ),
  COALESCE(NULLIF(s.description,''), 'Recebimento de venda'),
  'payment',
  jsonb_build_object(
    'backfill', true,
    'source_kind','sale_payment',
    'sale_id',   s.id::text,
    'sale_payment_idx', elem.ordinality::text,
    'business_type', s.business_type
  ),
  'account',
  now(), now()
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
         WITH ORDINALITY AS elem(value, ordinality)
 WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb)) = 'array'
   AND s.business_type IS DISTINCT FROM 'aluguel_veiculo'
   AND (elem.value->>'amount')::numeric IS NOT NULL
   AND (elem.value->>'amount')::numeric <> 0
ON CONFLICT (user_id, ((metadata->>'sale_id')), ((metadata->>'sale_payment_idx')))
   WHERE source = 'payment'
     AND metadata ? 'sale_id'
     AND metadata ? 'sale_payment_idx'
DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. TRIGGERS — sincronização a partir de agora.
-- -----------------------------------------------------------------------------

-- 6.1 expenses
CREATE OR REPLACE FUNCTION public.ledger_sync_expense()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE expense_id = OLD.id AND source = 'expense';
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.paid = true
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0
     AND (NEW.scope IS NULL OR NEW.scope='personal')
     AND NOT public.is_credit_card_expense(NEW.category) THEN
    INSERT INTO public.account_ledger
      (user_id, direction, category, amount, occurred_on, description,
       source, metadata, wallet, expense_id, payment_method_id, created_at, updated_at)
    VALUES (
      NEW.user_id, 'out', NEW.category, NEW.amount,
      COALESCE(NULLIF(NEW.paid_date,''), NULLIF(NEW.due_date,''), to_char(now(),'YYYY-MM-DD')),
      COALESCE(NULLIF(NEW.description,''), NEW.category),
      'expense',
      jsonb_build_object('source_kind','expense','scope',NEW.scope,'type',NEW.type),
      public.ledger_wallet(NEW.payment_method_id),
      NEW.id, NEW.payment_method_id, now(), now()
    )
    ON CONFLICT (expense_id) WHERE expense_id IS NOT NULL AND source='expense'
    DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_expense ON public.expenses;
CREATE TRIGGER trg_ledger_sync_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_expense();


-- 6.2 incomes
CREATE OR REPLACE FUNCTION public.ledger_sync_income()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_new_ledger uuid;
BEGIN
  -- Remove ledger antigo se estava vinculado.
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.ledger_id IS NOT NULL THEN
    DELETE FROM public.account_ledger WHERE id = OLD.ledger_id;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status='received'
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0 THEN
    INSERT INTO public.account_ledger
      (user_id, direction, category, amount, occurred_on, description,
       source, metadata, wallet, payment_method_id, created_at, updated_at)
    VALUES (
      NEW.user_id, 'in',
      COALESCE(NEW.category,'income'),
      NEW.amount,
      to_char(COALESCE(NEW.actual_received_date, NEW.received_date),'YYYY-MM-DD'),
      COALESCE(NULLIF(NEW.description,''), COALESCE(NEW.category,'Receita')),
      'payment',
      jsonb_build_object('source_kind','income','income_id',NEW.id::text),
      public.ledger_wallet(NEW.payment_method_id),
      NEW.payment_method_id, now(), now()
    )
    RETURNING id INTO v_new_ledger;

    -- Atualiza ledger_id sem disparar recursão da trigger.
    UPDATE public.incomes SET ledger_id = v_new_ledger
     WHERE id = NEW.id AND ledger_id IS DISTINCT FROM v_new_ledger;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- Trigger só dispara em mudanças que importam para o ledger — evita loop com
-- o UPDATE de ledger_id acima.
DROP TRIGGER IF EXISTS trg_ledger_sync_income ON public.incomes;
CREATE TRIGGER trg_ledger_sync_income
AFTER INSERT OR UPDATE OF status, amount, received_date, actual_received_date,
                          category, description, payment_method_id
    OR DELETE
ON public.incomes
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_income();


-- 6.3 sales — reprocessa payment_history inteiro em cada mudança.
CREATE OR REPLACE FUNCTION public.ledger_sync_sale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id   uuid := COALESCE(NEW.id, OLD.id);
  v_user uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  DELETE FROM public.account_ledger
   WHERE user_id = v_user
     AND source = 'payment'
     AND metadata->>'source_kind' = 'sale_payment'
     AND metadata->>'sale_id' = v_id::text;

  IF TG_OP <> 'DELETE'
     AND NEW.business_type IS DISTINCT FROM 'aluguel_veiculo'
     AND jsonb_typeof(COALESCE(NEW.payment_history,'[]'::jsonb)) = 'array' THEN
    INSERT INTO public.account_ledger
      (user_id, direction, category, amount, occurred_on, description,
       source, metadata, wallet, created_at, updated_at)
    SELECT
      NEW.user_id, 'in',
      COALESCE(NEW.category,'sale'),
      (elem.value->>'amount')::numeric,
      COALESCE(NULLIF(elem.value->>'date',''), NULLIF(NEW.sale_date,''), to_char(now(),'YYYY-MM-DD')),
      COALESCE(NULLIF(NEW.description,''), 'Recebimento de venda'),
      'payment',
      jsonb_build_object(
        'source_kind','sale_payment',
        'sale_id',   NEW.id::text,
        'sale_payment_idx', elem.ordinality::text,
        'business_type', NEW.business_type
      ),
      'account',
      now(), now()
      FROM jsonb_array_elements(NEW.payment_history) WITH ORDINALITY AS elem(value, ordinality)
     WHERE (elem.value->>'amount')::numeric IS NOT NULL
       AND (elem.value->>'amount')::numeric <> 0
    ON CONFLICT (user_id, ((metadata->>'sale_id')), ((metadata->>'sale_payment_idx')))
       WHERE source='payment'
         AND metadata ? 'sale_id'
         AND metadata ? 'sale_payment_idx'
    DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_sale ON public.sales;
CREATE TRIGGER trg_ledger_sync_sale
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_sale();


-- -----------------------------------------------------------------------------
-- 7. Fim da transação. Revise a validação abaixo antes de COMMIT.
-- -----------------------------------------------------------------------------
-- COMMIT;
-- ROLLBACK;


-- =============================================================================
-- VALIDAÇÃO (rodar como SELECT antes do COMMIT — não altera nada)
-- =============================================================================
-- (a) Saldo oficial pelo ledger por usuário:
--   SELECT user_id,
--          SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) AS saldo_oficial,
--          COUNT(*) AS lancamentos
--     FROM public.account_ledger
--    GROUP BY user_id ORDER BY user_id;
--
-- (b) Nenhuma expense duplicada no ledger:
--   SELECT expense_id, COUNT(*) FROM public.account_ledger
--    WHERE expense_id IS NOT NULL AND source='expense'
--    GROUP BY 1 HAVING COUNT(*) > 1;
--
-- (c) Nenhum sale_payment duplicado:
--   SELECT user_id, metadata->>'sale_id', metadata->>'sale_payment_idx', COUNT(*)
--     FROM public.account_ledger
--    WHERE source='payment' AND metadata->>'source_kind'='sale_payment'
--    GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--
-- (d) Receitas ligadas:
--   SELECT COUNT(*) FILTER (WHERE ledger_id IS NOT NULL) AS com_ledger,
--          COUNT(*) FILTER (WHERE ledger_id IS NULL AND status='received') AS sem_ledger,
--          COUNT(*) AS total FROM public.incomes;


-- =============================================================================
-- ROLLBACK (bloco separado, se precisar desfazer)
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_expense ON public.expenses;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_income  ON public.incomes;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_sale    ON public.sales;
--   DROP FUNCTION IF EXISTS public.ledger_sync_expense();
--   DROP FUNCTION IF EXISTS public.ledger_sync_income();
--   DROP FUNCTION IF EXISTS public.ledger_sync_sale();
--   DROP FUNCTION IF EXISTS public.ledger_wallet(uuid);
--   DROP FUNCTION IF EXISTS public.is_credit_card_expense(text);
--   -- Remove só o que este backfill/trigger criou (via metadata.backfill=true
--   -- ou source_kind gerado). Preserva os 19+ lançamentos manuais anteriores.
--   UPDATE public.incomes SET ledger_id = NULL
--    WHERE ledger_id IN (
--      SELECT id FROM public.account_ledger
--       WHERE metadata->>'source_kind' = 'income'
--    );
--   DELETE FROM public.account_ledger
--    WHERE metadata->>'source_kind' IN ('expense','income','sale_payment');
--   DROP INDEX IF EXISTS public.account_ledger_expense_uidx;
--   DROP INDEX IF EXISTS public.account_ledger_sale_payment_uidx;
-- COMMIT;
