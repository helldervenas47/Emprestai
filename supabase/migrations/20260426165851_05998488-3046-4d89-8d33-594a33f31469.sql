ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS original_due_date text;
UPDATE public.loans SET original_due_date = due_date WHERE original_due_date IS NULL;