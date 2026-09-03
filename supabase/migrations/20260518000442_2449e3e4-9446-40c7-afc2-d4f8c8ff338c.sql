ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS add_to_incomes boolean NOT NULL DEFAULT false;
ALTER TABLE public.payroll_payments ADD COLUMN IF NOT EXISTS income_id uuid;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS income_id uuid;