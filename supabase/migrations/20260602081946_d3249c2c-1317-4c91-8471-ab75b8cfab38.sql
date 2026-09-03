-- Update manager_commissions
ALTER TABLE public.manager_commissions 
ADD COLUMN IF NOT EXISTS payment_id UUID,
ADD COLUMN IF NOT EXISTS commission_type TEXT CHECK (commission_type IN ('interest', 'full')),
ADD COLUMN IF NOT EXISTS base_amount DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create monthly_goals table
CREATE TABLE IF NOT EXISTS public.monthly_goals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    goal_type TEXT NOT NULL,
    month TEXT NOT NULL, -- YYYY-MM
    target_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, goal_type, month)
);

-- Consistency for monthly_goal_snapshots (fix for useGoalSnapshots.ts)
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS goal_type TEXT;

-- Consistency for balance_adjustments (fix for useBalanceAdjustments.ts)
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_goals TO authenticated;
GRANT ALL ON public.monthly_goals TO service_role;

-- Enable RLS
ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own monthly goals" ON public.monthly_goals FOR ALL USING (auth.uid() = user_id);
