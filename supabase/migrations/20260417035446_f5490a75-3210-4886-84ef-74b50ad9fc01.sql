CREATE TABLE public.monthly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  goal_type TEXT NOT NULL,
  month TEXT NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_type, month)
);

ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view monthly_goals"
ON public.monthly_goals FOR SELECT TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert monthly_goals"
ON public.monthly_goals FOR INSERT TO authenticated
WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update monthly_goals"
ON public.monthly_goals FOR UPDATE TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete monthly_goals"
ON public.monthly_goals FOR DELETE TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_monthly_goals_updated_at
BEFORE UPDATE ON public.monthly_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_monthly_goals_user_month ON public.monthly_goals(user_id, month);