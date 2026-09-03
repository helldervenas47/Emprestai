-- Adiciona controle de exibição por período (mensal / semestral / anual)
-- Aplique no SQL Editor do backend.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS show_monthly  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_semestral boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_anual    boolean NOT NULL DEFAULT true;

-- Garante que pelo menos uma modalidade esteja ativa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_at_least_one_cycle') THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_at_least_one_cycle
      CHECK (show_monthly OR show_semestral OR show_anual);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
