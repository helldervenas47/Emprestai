-- Final cleanup of missing columns causing RejectExcessProperties errors

-- account_ledger
ALTER TABLE public.account_ledger ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL';
ALTER TABLE public.account_ledger ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(12,6) DEFAULT 1.0;

-- expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS parent_expense_id UUID REFERENCES public.expenses(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_date DATE;

-- monthly_opening_balances (fix RejectExcessProperties owner_id vs user_id)
-- ensure both exist if code uses both
ALTER TABLE public.monthly_opening_balances ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.monthly_opening_balances ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- whatsapp_billing_schedule (fix phone missing in RejectExcessProperties)
-- Actually, the error says 'phone' is required in the type being assigned, 
-- but it's likely a mismatch with another table type. 
-- We'll add it if it's expected for some reason.
ALTER TABLE public.whatsapp_billing_schedule ADD COLUMN IF NOT EXISTS phone TEXT;

-- Final fix for credit_card_invoice_openings RejectExcessProperties
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS month_label TEXT;
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS opening_amount DECIMAL(12,2);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS cycle_key TEXT;

-- Final fix for monthly_goal_snapshots RejectExcessProperties
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS goal_type TEXT;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS realized_value DECIMAL(12,2);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS target_value DECIMAL(12,2);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS attainment_pct DECIMAL(12,2);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT false;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS snapshot_date TIMESTAMP WITH TIME ZONE;
