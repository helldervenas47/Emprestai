-- Create monthly_opening_balances table
CREATE TABLE IF NOT EXISTS public.monthly_opening_balances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    owner_id UUID REFERENCES auth.users(id),
    month TEXT NOT NULL, -- YYYY-MM
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, month)
);

-- Final unify for balance_adjustments, credit_card_invoice_openings, monthly_goal_snapshots
-- based on recurring build errors about missing user_id in RejectExcessProperties
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_opening_balances TO authenticated;
GRANT ALL ON public.monthly_opening_balances TO service_role;

-- Enable RLS
ALTER TABLE public.monthly_opening_balances ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own monthly opening balances" ON public.monthly_opening_balances FOR ALL USING (auth.uid() = user_id);

-- Extra check for credit_cards 'name' field
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Cartão';
