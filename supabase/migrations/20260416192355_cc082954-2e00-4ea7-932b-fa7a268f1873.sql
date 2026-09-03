CREATE TABLE public.personal_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

ALTER TABLE public.personal_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view personal_budgets"
ON public.personal_budgets FOR SELECT TO authenticated
USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert personal_budgets"
ON public.personal_budgets FOR INSERT TO authenticated
WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update personal_budgets"
ON public.personal_budgets FOR UPDATE TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete personal_budgets"
ON public.personal_budgets FOR DELETE TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_personal_budgets_updated_at
BEFORE UPDATE ON public.personal_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();