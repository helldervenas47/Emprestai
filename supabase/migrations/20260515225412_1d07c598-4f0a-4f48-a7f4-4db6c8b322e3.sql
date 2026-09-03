ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS payment_method_split JSONB;