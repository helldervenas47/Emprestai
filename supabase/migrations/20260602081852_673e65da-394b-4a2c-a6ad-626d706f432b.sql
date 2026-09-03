-- Ensure consistent column naming and existence for all critical tables
-- Fixing 'user_id' vs 'owner_id' mismatches reported in build errors

-- balance_adjustments
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- monthly_goal_snapshots
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE CASCADE;
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS month_label TEXT;

-- expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS parent_expense_id UUID REFERENCES public.expenses(id);

-- boleto_lookups
ALTER TABLE public.boleto_lookups ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.boleto_lookups ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2);

-- Update RLS to be more permissive during development if needed, 
-- but following the pattern: auth.uid() = user_id OR auth.uid() = owner_id
CREATE POLICY "Users can manage their own balance adjustments user_id" ON public.balance_adjustments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own goal snapshots user_id" ON public.monthly_goal_snapshots FOR ALL USING (auth.uid() = user_id);

-- Add missing columns to credit_cards
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Cartão';

-- Final check on types: 'name' is required in some places for credit_cards
-- but error says property 'name' is missing in type passed to insert.
-- This usually means the table definition has 'name' as NOT NULL without a default,
-- or the code is missing it. We'll ensure it has a default.
ALTER TABLE public.credit_cards ALTER COLUMN name SET DEFAULT 'Novo Cartão';
