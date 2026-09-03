-- Final structural fixes for build errors

-- my_boletos missing 'digits' column (it was added in a previous call but may have failed or was inconsistent)
ALTER TABLE public.my_boletos ADD COLUMN IF NOT EXISTS digits TEXT;

-- Unified user_id check for all critical tables
-- The error "Property 'user_id' is missing but required" in RejectExcessProperties 
-- confirms these tables MUST have user_id NOT NULL if the code passes it.

ALTER TABLE public.balance_adjustments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.credit_card_invoice_openings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.monthly_goal_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.monthly_opening_balances ALTER COLUMN user_id SET NOT NULL;

-- manager_commissions extra columns
ALTER TABLE public.manager_commissions ADD COLUMN IF NOT EXISTS base_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.manager_commissions ADD COLUMN IF NOT EXISTS rate DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.manager_commissions ADD COLUMN IF NOT EXISTS commission_type TEXT;

-- monthly_goals
ALTER TABLE public.monthly_goals ADD COLUMN IF NOT EXISTS target_value DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Ensure RLS policies use 'user_id' as the primary filter
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_id_access_commissions') THEN
        CREATE POLICY "user_id_access_commissions" ON public.manager_commissions FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
