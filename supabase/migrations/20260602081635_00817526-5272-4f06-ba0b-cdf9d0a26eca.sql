-- Update credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS cycle_key TEXT;

-- Update credit_cards
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS bank TEXT;

-- Update credit_limit_history
ALTER TABLE public.credit_limit_history ADD COLUMN IF NOT EXISTS reason TEXT;

-- Create my_boletos table
CREATE TABLE IF NOT EXISTS public.my_boletos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    external_id TEXT,
    barcode TEXT,
    description TEXT,
    amount DECIMAL(12,2),
    due_date DATE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create my_boleto_payments table
CREATE TABLE IF NOT EXISTS public.my_boleto_payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    boleto_id UUID REFERENCES public.my_boletos(id) ON DELETE CASCADE,
    amount DECIMAL(12,2),
    payment_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_boletos TO authenticated;
GRANT ALL ON public.my_boletos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_boleto_payments TO authenticated;
GRANT ALL ON public.my_boleto_payments TO service_role;

-- Enable RLS
ALTER TABLE public.my_boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_boleto_payments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own boletos" ON public.my_boletos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own boleto payments" ON public.my_boleto_payments FOR ALL USING (auth.uid() = user_id);
