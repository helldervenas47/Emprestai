
CREATE TABLE public.personal_expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Package',
  color TEXT NOT NULL DEFAULT '215 15% 55%',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.personal_expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view personal_expense_categories"
ON public.personal_expense_categories FOR SELECT
TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert personal_expense_categories"
ON public.personal_expense_categories FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update personal_expense_categories"
ON public.personal_expense_categories FOR UPDATE
TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete personal_expense_categories"
ON public.personal_expense_categories FOR DELETE
TO authenticated
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_personal_expense_categories_updated_at
BEFORE UPDATE ON public.personal_expense_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
