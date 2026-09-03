-- ==============================================================
-- Congelamento (imutabilidade) das Comissões Pagas de Gerentes
-- Aplicar no projeto Supabase EXTERNO (SQL Editor).
-- Idempotente: pode ser re-executado sem efeitos colaterais.
--
-- Objetivo:
--   Persistir a comissão no momento do pagamento (valor congelado) em
--   public.manager_commissions, de modo que o histórico de "Comissões Pagas"
--   nunca mude por: edição do contrato (valor / taxa / nº de parcelas),
--   desativação do gerente, remoção do flag "is_manager" ou truncamento de
--   dados no cliente.
--
--   Após aplicar, o app continua exibindo comissões derivadas apenas como
--   fallback para pagamentos antigos que (por qualquer motivo) não tenham
--   linha registrada.
-- ==============================================================

-- --------------------------------------------------------------
-- 1) Colunas de rastreabilidade + limpeza de FK inválida
-- --------------------------------------------------------------
ALTER TABLE public.manager_commissions
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS manager_name_snapshot text,
  ADD COLUMN IF NOT EXISTS installments_snapshot integer,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true;

-- manager_id guarda o id do CLIENTE gerente (não auth.users).
-- Remove qualquer FK herdada para auth.users que impeça a gravação.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public'
       AND rel.relname = 'manager_commissions'
       AND con.contype = 'f'
       AND con.conkey = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = con.conrelid AND attname = 'manager_id')
           ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.manager_commissions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.manager_commissions ALTER COLUMN manager_id DROP NOT NULL;

-- Índice único: no máximo 1 comissão por pagamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_manager_commissions_payment
  ON public.manager_commissions (loan_id, payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manager_commissions_generated_at
  ON public.manager_commissions (user_id, generated_at);

-- --------------------------------------------------------------
-- 2) Resolução do gerente do contrato (mesma regra do front-end)
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_loan_manager_id(p_loan_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH l AS (
    SELECT * FROM public.loans WHERE id = p_loan_id
  )
  SELECT CASE
    WHEN (SELECT has_manager FROM l) IS NOT TRUE THEN NULL
    WHEN (SELECT manager_id FROM l) IS NOT NULL THEN (SELECT manager_id FROM l)
    WHEN EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = (SELECT borrower_id FROM l) AND c.is_manager IS TRUE
    ) THEN (SELECT borrower_id FROM l)
    ELSE (
      SELECT c.id FROM public.clients c
       WHERE c.user_id = (SELECT user_id FROM l)
         AND c.is_manager IS TRUE
         AND lower(btrim(c.name)) = lower(btrim(COALESCE((SELECT borrower_name FROM l), '')))
       LIMIT 1
    )
  END;
$$;

-- --------------------------------------------------------------
-- 3) Valor da comissão derivada de um pagamento (regra unificada)
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derived_payment_commission(
  p_loan_id uuid,
  p_installment_number integer
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_rate numeric;
  v_installments integer;
  v_total numeric;
BEGIN
  SELECT l.amount, COALESCE(l.manager_commission_rate, 10), GREATEST(COALESCE(l.installments, 1), 1)
    INTO v_amount, v_rate, v_installments
    FROM public.loans l WHERE l.id = p_loan_id;

  IF v_amount IS NULL THEN
    RETURN 0;
  END IF;

  v_total := (v_amount * v_rate) / 100.0;

  IF p_installment_number > 0 THEN
    RETURN v_total / v_installments;
  ELSIF p_installment_number = 0 THEN
    RETURN v_total;
  ELSIF p_installment_number = -1 AND v_installments = 1 THEN
    RETURN v_total;
  END IF;

  RETURN 0;
END $$;

-- --------------------------------------------------------------
-- 4) Trigger: congela a comissão no instante do pagamento
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_manager_commission_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_id uuid;
  v_manager_name text;
  v_commission numeric;
  v_loan record;
BEGIN
  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id;
  IF v_loan IS NULL OR v_loan.has_manager IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_manager_id := public.resolve_loan_manager_id(NEW.loan_id);
  IF v_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_commission := public.derived_payment_commission(NEW.loan_id, NEW.installment_number);
  IF v_commission IS NULL OR v_commission <= 0 THEN
    RETURN NEW;
  END IF;

  -- Uma comissão por parcela (o primeiro pagamento da parcela vence).
  IF NEW.installment_number > 0 AND EXISTS (
    SELECT 1 FROM public.manager_commissions mc
     WHERE mc.loan_id = NEW.loan_id
       AND mc.installment_number = NEW.installment_number
  ) THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_manager_name FROM public.clients c WHERE c.id = v_manager_id;

  INSERT INTO public.manager_commissions (
    user_id, loan_id, manager_id, payment_id, installment_number,
    commission_type, base_amount, rate, amount, generated_at,
    manager_name_snapshot, installments_snapshot, source, locked
  ) VALUES (
    NEW.user_id, NEW.loan_id, v_manager_id, NEW.id, NEW.installment_number,
    'full', v_loan.amount, COALESCE(v_loan.manager_commission_rate, 10), v_commission, NEW.date::text,
    v_manager_name, GREATEST(COALESCE(v_loan.installments, 1), 1), 'trigger', true
  )
  ON CONFLICT (loan_id, payment_id) WHERE payment_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_freeze_manager_commission ON public.payments;
CREATE TRIGGER trg_freeze_manager_commission
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.freeze_manager_commission_on_payment();

-- --------------------------------------------------------------
-- 5) Proteção do histórico: bloqueia alteração de linhas travadas
--    (exceções: notas, e limpeza via service_role)
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_locked_manager_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.locked IS TRUE
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
          OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
          OR NEW.loan_id IS DISTINCT FROM OLD.loan_id) THEN
    RAISE EXCEPTION 'Comissão paga é imutável (id=%). Estorne o pagamento correspondente para reverter.', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_locked_manager_commission ON public.manager_commissions;
CREATE TRIGGER trg_protect_locked_manager_commission
BEFORE UPDATE ON public.manager_commissions
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_manager_commission();

-- --------------------------------------------------------------
-- 6) Backfill: congela o histórico já existente
--    (usa o primeiro pagamento de cada parcela, ordem determinística)
-- --------------------------------------------------------------
WITH ranked AS (
  SELECT
    p.id AS payment_id,
    p.user_id,
    p.loan_id,
    p.installment_number,
    p.date,
    row_number() OVER (
      PARTITION BY p.loan_id, p.installment_number
      ORDER BY p.date ASC, p.created_at ASC, p.id ASC
    ) AS rn
  FROM public.payments p
  JOIN public.loans l ON l.id = p.loan_id
  WHERE l.has_manager IS TRUE
),
first_per_installment AS (
  SELECT * FROM ranked WHERE rn = 1
),
candidates AS (
  SELECT
    f.*,
    public.resolve_loan_manager_id(f.loan_id) AS manager_id,
    public.derived_payment_commission(f.loan_id, f.installment_number) AS commission
  FROM first_per_installment f
)
INSERT INTO public.manager_commissions (
  user_id, loan_id, manager_id, payment_id, installment_number,
  commission_type, base_amount, rate, amount, generated_at,
  manager_name_snapshot, installments_snapshot, source, locked
)
SELECT
  c.user_id, c.loan_id, c.manager_id, c.payment_id, c.installment_number,
  'full', l.amount, COALESCE(l.manager_commission_rate, 10), c.commission, c.date::text,
  cl.name, GREATEST(COALESCE(l.installments, 1), 1), 'backfill', true
FROM candidates c
JOIN public.loans l ON l.id = c.loan_id
LEFT JOIN public.clients cl ON cl.id = c.manager_id
WHERE c.manager_id IS NOT NULL
  AND c.commission > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.manager_commissions mc
     WHERE mc.loan_id = c.loan_id
       AND (mc.payment_id = c.payment_id
            OR (c.installment_number > 0 AND mc.installment_number = c.installment_number))
  )
ON CONFLICT (loan_id, payment_id) WHERE payment_id IS NOT NULL DO NOTHING;

-- Marca linhas antigas (pré-existentes) como travadas também.
UPDATE public.manager_commissions
   SET locked = true
 WHERE locked IS NOT TRUE;

-- --------------------------------------------------------------
-- 7) Estorno: ao excluir o pagamento, a comissão congelada sai
--    (única forma legítima de reduzir o total pago)
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_manager_commission_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.manager_commissions
   WHERE loan_id = OLD.loan_id
     AND payment_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_reverse_manager_commission ON public.payments;
CREATE TRIGGER trg_reverse_manager_commission
AFTER DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.reverse_manager_commission_on_payment_delete();

-- --------------------------------------------------------------
-- 8) Conferência rápida (opcional)
-- --------------------------------------------------------------
-- SELECT source, count(*), sum(amount) FROM public.manager_commissions GROUP BY 1;
-- SELECT to_char((generated_at)::date, 'YYYY-MM') AS mes, sum(amount)
--   FROM public.manager_commissions GROUP BY 1 ORDER BY 1;
