-- Estende a tabela public.plans para a subaba "Planos" (Sistema → Planos)
-- Aplique este script no Painel de Migração (Sistema → Painel Migração) ou no SQL Editor.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_semestral numeric,
  ADD COLUMN IF NOT EXISTS price_anual numeric,
  ADD COLUMN IF NOT EXISTS discount_semestral numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_anual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS promo_text text,
  ADD COLUMN IF NOT EXISTS highlight_color text,
  ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false;

-- Validações de desconto (0..100)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_discount_semestral_range') THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_discount_semestral_range
      CHECK (discount_semestral IS NULL OR (discount_semestral >= 0 AND discount_semestral <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_discount_anual_range') THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_discount_anual_range
      CHECK (discount_anual IS NULL OR (discount_anual >= 0 AND discount_anual <= 100));
  END IF;
END $$;

-- GRANTs
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

-- RLS: admins podem gerenciar
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans admin manage" ON public.plans;
CREATE POLICY "plans admin manage"
  ON public.plans
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Leitura pública (mantém comportamento atual da página de planos)
DROP POLICY IF EXISTS "plans public read" ON public.plans;
CREATE POLICY "plans public read"
  ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (true);
