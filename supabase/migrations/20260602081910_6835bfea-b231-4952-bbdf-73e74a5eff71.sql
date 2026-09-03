-- Crucial missing column for loans table
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(12,2) DEFAULT 0;

-- Ensure consistency for balance_adjustments
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
-- If owner_id is also used in code, ensure it exists
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Ensure consistency for credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES public.credit_cards(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS month_label TEXT;

-- Ensure consistency for monthly_goal_snapshots
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Ensure name on credit_cards (required by build logs)
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Novo Cartão';

-- RLS check to ensure 'user_id' policies exist for these added columns
CREATE POLICY "RLS balance_adjustments user_id" ON public.balance_adjustments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "RLS credit_card_invoice_openings user_id" ON public.credit_card_invoice_openings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "RLS monthly_goal_snapshots user_id" ON public.monthly_goal_snapshots FOR ALL USING (auth.uid() = user_id);
