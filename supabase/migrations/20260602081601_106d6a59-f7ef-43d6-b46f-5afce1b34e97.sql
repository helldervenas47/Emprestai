-- Create credit_cards table
CREATE TABLE IF NOT EXISTS public.credit_cards (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    last_digits TEXT,
    brand TEXT,
    due_day INTEGER NOT NULL,
    closing_day INTEGER NOT NULL,
    credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    available_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    current_invoice_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create credit_card_invoice_openings table (for initial balances or historical openings)
CREATE TABLE IF NOT EXISTS public.credit_card_invoice_openings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
    month_label TEXT NOT NULL,
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_invoice_openings TO authenticated;
GRANT ALL ON public.credit_card_invoice_openings TO service_role;

-- Enable RLS
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoice_openings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own credit cards" ON public.credit_cards FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own invoice openings" ON public.credit_card_invoice_openings FOR ALL USING (auth.uid() = user_id);
