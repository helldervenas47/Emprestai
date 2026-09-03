-- Update credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS opening_amount DECIMAL(12,2);

-- Update credit_cards
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS last_four TEXT;

-- Update credit_limit_history
ALTER TABLE public.credit_limit_history ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES auth.users(id);

-- Create monthly_goal_snapshots table
CREATE TABLE IF NOT EXISTS public.monthly_goal_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    month TEXT NOT NULL,
    category TEXT,
    target_value DECIMAL(12,2),
    current_value DECIMAL(12,2),
    reached BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, month, category)
);

-- Create loan_installments table
CREATE TABLE IF NOT EXISTS public.loan_installments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(loan_id, installment_number)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_goal_snapshots TO authenticated;
GRANT ALL ON public.monthly_goal_snapshots TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_installments TO authenticated;
GRANT ALL ON public.loan_installments TO service_role;

-- Enable RLS
ALTER TABLE public.monthly_goal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own goal snapshots" ON public.monthly_goal_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own loan installments" ON public.loan_installments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.loans WHERE id = loan_id AND user_id = auth.uid())
);
