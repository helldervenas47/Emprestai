ALTER TABLE public.loan_renegotiations
ADD COLUMN IF NOT EXISTS previous_state jsonb;