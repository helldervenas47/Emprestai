CREATE TABLE public.personal_budget_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  month TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, month)
);

ALTER TABLE public.personal_budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view personal_budget_alerts"
ON public.personal_budget_alerts FOR SELECT TO authenticated
USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert personal_budget_alerts"
ON public.personal_budget_alerts FOR INSERT TO authenticated
WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Service role manages personal_budget_alerts"
ON public.personal_budget_alerts FOR ALL TO public
USING (auth.role() = 'service_role');