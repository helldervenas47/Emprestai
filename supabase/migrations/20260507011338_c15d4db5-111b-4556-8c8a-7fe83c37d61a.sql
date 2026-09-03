
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON public.expenses(payment_method_id) WHERE payment_method_id IS NOT NULL;
