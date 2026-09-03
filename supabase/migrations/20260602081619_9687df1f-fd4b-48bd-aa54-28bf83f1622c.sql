-- Update credit_cards
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS nickname TEXT;

-- Update credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES public.credit_cards(id) ON DELETE CASCADE;

-- Update credit_limit_history
ALTER TABLE public.credit_limit_history ADD COLUMN IF NOT EXISTS previous_limit DECIMAL(12,2);

-- Create credit_limits table
CREATE TABLE IF NOT EXISTS public.credit_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    client_id UUID NOT NULL REFERENCES public.clients(id) UNIQUE,
    current_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    mode TEXT DEFAULT 'manual' CHECK (mode IN ('auto', 'manual')),
    last_auto_calculated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_limits TO authenticated;
GRANT ALL ON public.credit_limits TO service_role;

-- Enable RLS
ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own credit limits" ON public.credit_limits FOR ALL USING (auth.uid() = user_id);
