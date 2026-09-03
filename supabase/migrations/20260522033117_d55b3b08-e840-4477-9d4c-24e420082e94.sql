ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS generate_income_on_pay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_income_id uuid NULL;