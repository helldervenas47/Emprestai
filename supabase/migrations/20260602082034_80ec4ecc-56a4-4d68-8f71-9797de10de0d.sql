-- Create personal_expense_categories table
CREATE TABLE IF NOT EXISTS public.personal_expense_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Final column fix for credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS opening_amount DECIMAL(12,2) DEFAULT 0;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_expense_categories TO authenticated;
GRANT ALL ON public.personal_expense_categories TO service_role;

-- Enable RLS
ALTER TABLE public.personal_expense_categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own personal expense categories" ON public.personal_expense_categories FOR ALL USING (auth.uid() = user_id);
