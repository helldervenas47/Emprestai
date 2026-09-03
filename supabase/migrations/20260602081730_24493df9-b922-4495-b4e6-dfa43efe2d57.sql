-- Create user_sessions table
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    ip_address TEXT,
    user_agent TEXT,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_current_session BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update loan_installments (fix based on useLoans.ts needs)
-- The error "Property 'paid' does not exist on type 'SelectQueryError<"column 'scope' does not exist on 'expenses'.">'"
-- was likely due to stale types during migration or missing columns.
ALTER TABLE public.loan_installments ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;
ALTER TABLE public.loan_installments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- Update monthly_goal_snapshots (fix based on useGoalSnapshots.ts needs)
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS goal_type TEXT;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS realized_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS attainment_pct DECIMAL(12,2);
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT false;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own sessions" ON public.user_sessions FOR ALL USING (auth.uid() = user_id);

-- Update get_data_owner_id function to handle UUID properly (already UUID in previous migration, but ensuring)
CREATE OR REPLACE FUNCTION public.get_data_owner_id(_user_id UUID)
RETURNS UUID AS $$
DECLARE
    _owner_id UUID;
BEGIN
    SELECT owner_id INTO _owner_id FROM public.user_owner WHERE user_id = _user_id;
    RETURN COALESCE(_owner_id, _user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
