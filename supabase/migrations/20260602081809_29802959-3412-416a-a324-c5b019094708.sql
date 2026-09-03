-- Create personal_budgets table
CREATE TABLE IF NOT EXISTS public.personal_budgets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    category TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    month TEXT NOT NULL, -- YYYY-MM
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, category, month)
);

-- Create credit_card_invoices table (for explicit overrides or tracking)
CREATE TABLE IF NOT EXISTS public.credit_card_invoices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
    month_label TEXT NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'open',
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, credit_card_id, month_label)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_budgets TO authenticated;
GRANT ALL ON public.personal_budgets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_invoices TO authenticated;
GRANT ALL ON public.credit_card_invoices TO service_role;

-- Enable RLS
ALTER TABLE public.personal_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own personal budgets" ON public.personal_budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own credit card invoices" ON public.credit_card_invoices FOR ALL USING (auth.uid() = user_id);
