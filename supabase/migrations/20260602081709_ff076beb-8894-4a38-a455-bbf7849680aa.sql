-- Update credit_card_invoice_openings
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update credit_limit_history
ALTER TABLE public.credit_limit_history ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Update monthly_goal_snapshots
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Update loan_installments
ALTER TABLE public.loan_installments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update balance_adjustments
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Ensure owner_id on stock_movements (already there from previous, but double checking)
-- Update expenses to ensure paid_date is consistent
-- No changes needed to expenses paid_date for now based on errors.

-- Fix for AutoBackupCard error: 'owner_id' not assignable to account_settings
-- The error implies 'owner_id' is used in .eq() but it should be 'user_id' in that table based on types.
-- Actually, the error says 'owner_id' is not assignable to parameter of type 'auto_backup_enabled' | 'id' | ...
-- This usually means the code is trying to update/insert with 'owner_id' which doesn't exist in that table.
ALTER TABLE public.account_settings ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
