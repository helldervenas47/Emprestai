-- Adiciona escopo mensal em personal_budgets para permitir limites diferentes por mês.
ALTER TABLE public.personal_budgets
  ADD COLUMN IF NOT EXISTS month text;

-- Backfill: registros existentes (limites globais) viram limite do mês corrente.
UPDATE public.personal_budgets
SET month = to_char(now(), 'YYYY-MM')
WHERE month IS NULL;

ALTER TABLE public.personal_budgets
  ALTER COLUMN month SET NOT NULL,
  ALTER COLUMN month SET DEFAULT to_char(now(), 'YYYY-MM');

-- Garante apenas um limite por (usuário, categoria, mês). Remove unique antiga se existir.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.personal_budgets'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.personal_budgets DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS personal_budgets_user_category_month_uniq
  ON public.personal_budgets (user_id, category, month);

CREATE INDEX IF NOT EXISTS personal_budgets_user_month_idx
  ON public.personal_budgets (user_id, month);