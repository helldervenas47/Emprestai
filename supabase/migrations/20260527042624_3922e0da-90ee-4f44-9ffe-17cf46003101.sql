ALTER TABLE public.my_boletos ADD COLUMN IF NOT EXISTS income_id uuid NULL;
CREATE UNIQUE INDEX IF NOT EXISTS my_boletos_income_id_unique ON public.my_boletos(income_id) WHERE income_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_my_boletos_income ON public.my_boletos(income_id);