-- =============================================================================
-- P0-01b — ADDENDUM: backfill + trigger para `balance_adjustments`
-- =============================================================================
-- Complementa `p0_01b_account_ledger_backfill.sql`. Rodar DEPOIS do arquivo
-- principal (usa a mesma convenção de columns NOT NULL do account_ledger).
--
-- Schema (confirmado):
--   balance_adjustments(id, owner_id NOT NULL, adjustment_date DATE NOT NULL,
--     amount NUMERIC NOT NULL,           -- novo saldo (absoluto)
--     previous_amount NUMERIC NOT NULL,  -- saldo anterior
--     adjusted_by, notes, created_at, updated_at)
--
-- Regra de conversão para ledger:
--   delta = amount - previous_amount
--   direction = 'in' se delta > 0, 'out' se delta < 0
--   valor lançado = |delta|
--   ajustes com delta = 0 são ignorados (não afetam saldo)
--
-- Idempotência: metadata->>'adjustment_id' + índice único parcial.
--
-- Convenções reusadas do ledger:
--   source   = 'adjustment' (já existente — 29 linhas hoje)
--   category = 'Ajuste manual'
--   wallet   = 'account' (ajustes hoje são sempre na conta principal)
-- =============================================================================


BEGIN;

-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT
-- -----------------------------------------------------------------------------
DO $$
DECLARE missing text := '';
BEGIN
  FOR chk IN
    SELECT * FROM (VALUES
      ('balance_adjustments','owner_id'),
      ('balance_adjustments','adjustment_date'),
      ('balance_adjustments','amount'),
      ('balance_adjustments','previous_amount'),
      ('account_ledger','metadata'),
      ('account_ledger','source')
    ) AS t(tbl,col)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public'
                      AND table_name=chk.tbl AND column_name=chk.col) THEN
      missing := missing || chk.tbl || '.' || chk.col || ' ';
    END IF;
  END LOOP;
  IF missing <> '' THEN RAISE EXCEPTION 'Colunas ausentes: %', missing; END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Índice único parcial para idempotência
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_adjustment_uidx
  ON public.account_ledger (((metadata->>'adjustment_id')))
  WHERE source = 'adjustment' AND metadata ? 'adjustment_id';


-- -----------------------------------------------------------------------------
-- 2. Backfill
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger
  (user_id, direction, category, amount, occurred_on, description,
   source, metadata, wallet, created_at, updated_at)
SELECT
  ba.owner_id,
  CASE WHEN (ba.amount - ba.previous_amount) > 0 THEN 'in' ELSE 'out' END,
  'Ajuste manual',
  ABS(ba.amount - ba.previous_amount),
  to_char(ba.adjustment_date, 'YYYY-MM-DD'),
  COALESCE(NULLIF(ba.notes,''), 'Ajuste manual de saldo'),
  'adjustment',
  jsonb_build_object(
    'backfill', true,
    'source_kind','balance_adjustment',
    'adjustment_id', ba.id::text,
    'previous_amount', ba.previous_amount,
    'new_amount', ba.amount
  ),
  'account',
  now(), now()
  FROM public.balance_adjustments ba
 WHERE (ba.amount - ba.previous_amount) <> 0
ON CONFLICT (((metadata->>'adjustment_id')))
   WHERE source='adjustment' AND metadata ? 'adjustment_id'
DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Trigger de sincronização
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_sync_balance_adjustment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_delta numeric;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE source='adjustment'
       AND metadata->>'adjustment_id' = OLD.id::text;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_delta := NEW.amount - NEW.previous_amount;
    IF v_delta <> 0 THEN
      INSERT INTO public.account_ledger
        (user_id, direction, category, amount, occurred_on, description,
         source, metadata, wallet, created_at, updated_at)
      VALUES (
        NEW.owner_id,
        CASE WHEN v_delta > 0 THEN 'in' ELSE 'out' END,
        'Ajuste manual',
        ABS(v_delta),
        to_char(NEW.adjustment_date,'YYYY-MM-DD'),
        COALESCE(NULLIF(NEW.notes,''),'Ajuste manual de saldo'),
        'adjustment',
        jsonb_build_object(
          'source_kind','balance_adjustment',
          'adjustment_id', NEW.id::text,
          'previous_amount', NEW.previous_amount,
          'new_amount', NEW.amount
        ),
        'account', now(), now()
      )
      ON CONFLICT (((metadata->>'adjustment_id')))
         WHERE source='adjustment' AND metadata ? 'adjustment_id'
      DO NOTHING;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_balance_adjustment ON public.balance_adjustments;
CREATE TRIGGER trg_ledger_sync_balance_adjustment
AFTER INSERT OR UPDATE OR DELETE ON public.balance_adjustments
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_balance_adjustment();


-- -----------------------------------------------------------------------------
-- 4. Fim da transação — revisar validação antes de COMMIT
-- -----------------------------------------------------------------------------
-- COMMIT;
-- ROLLBACK;


-- =============================================================================
-- VALIDAÇÃO (SELECT — não altera nada)
-- =============================================================================
-- (a) Cada ajuste com delta != 0 tem exatamente 1 linha no ledger:
--   SELECT ba.id,
--          (ba.amount - ba.previous_amount) AS delta,
--          COUNT(l.id) AS linhas_no_ledger
--     FROM public.balance_adjustments ba
--     LEFT JOIN public.account_ledger l
--       ON l.source='adjustment'
--      AND l.metadata->>'adjustment_id' = ba.id::text
--    WHERE (ba.amount - ba.previous_amount) <> 0
--    GROUP BY ba.id, ba.amount, ba.previous_amount
--    HAVING COUNT(l.id) <> 1;   -- deve retornar 0 linhas
--
-- (b) Nenhum ajuste duplicado:
--   SELECT metadata->>'adjustment_id' AS aid, COUNT(*)
--     FROM public.account_ledger
--    WHERE source='adjustment' AND metadata ? 'adjustment_id'
--    GROUP BY 1 HAVING COUNT(*) > 1;   -- deve retornar 0 linhas
--
-- (c) Soma dos deltas por usuário casa com a soma dos lançamentos:
--   WITH deltas AS (
--     SELECT owner_id AS user_id,
--            SUM(amount - previous_amount) AS delta_total
--       FROM public.balance_adjustments GROUP BY owner_id
--   ), leds AS (
--     SELECT user_id,
--            SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) AS ledger_total
--       FROM public.account_ledger
--      WHERE source='adjustment' AND metadata->>'source_kind'='balance_adjustment'
--      GROUP BY user_id
--   )
--   SELECT COALESCE(d.user_id, l.user_id) AS user_id,
--          COALESCE(d.delta_total,0) AS delta_esperado,
--          COALESCE(l.ledger_total,0) AS delta_lancado,
--          COALESCE(d.delta_total,0) - COALESCE(l.ledger_total,0) AS diferenca
--     FROM deltas d FULL OUTER JOIN leds l USING (user_id)
--    WHERE COALESCE(d.delta_total,0) - COALESCE(l.ledger_total,0) <> 0;
--   -- deve retornar 0 linhas


-- =============================================================================
-- ROLLBACK (bloco separado)
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_balance_adjustment
--     ON public.balance_adjustments;
--   DROP FUNCTION IF EXISTS public.ledger_sync_balance_adjustment();
--   DELETE FROM public.account_ledger
--    WHERE source='adjustment'
--      AND metadata->>'source_kind' = 'balance_adjustment';
--   DROP INDEX IF EXISTS public.account_ledger_adjustment_uidx;
-- COMMIT;
