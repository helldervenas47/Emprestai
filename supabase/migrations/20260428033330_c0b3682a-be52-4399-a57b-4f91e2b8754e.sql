ALTER TABLE public.account_settings
ADD COLUMN IF NOT EXISTS max_credit_limit NUMERIC;