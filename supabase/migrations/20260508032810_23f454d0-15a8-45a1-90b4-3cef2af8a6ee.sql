-- Income categories per user (used by the Receitas form)
CREATE TABLE IF NOT EXISTS public.income_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Package',
  color TEXT NOT NULL DEFAULT '215 15% 55%',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own income categories"
  ON public.income_categories FOR SELECT
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own income categories"
  ON public.income_categories FOR INSERT
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update own income categories"
  ON public.income_categories FOR UPDATE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete own income categories"
  ON public.income_categories FOR DELETE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_income_categories_updated_at
  BEFORE UPDATE ON public.income_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.income_categories;