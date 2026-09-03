
-- Create table for persisting individual installment schedules
CREATE TABLE public.loan_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_number)
);

-- Enable RLS
ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own installments"
ON public.loan_installments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own installments"
ON public.loan_installments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own installments"
ON public.loan_installments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own installments"
ON public.loan_installments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Index for fast lookups by loan
CREATE INDEX idx_loan_installments_loan_id ON public.loan_installments(loan_id);
