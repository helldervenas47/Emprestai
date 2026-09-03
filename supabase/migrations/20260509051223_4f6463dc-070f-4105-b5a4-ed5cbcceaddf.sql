CREATE TABLE public.income_category_hints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT income_category_hints_user_keyword_category_key UNIQUE (user_id, keyword, category)
);
CREATE INDEX idx_income_category_hints_lookup ON public.income_category_hints (user_id, keyword);

ALTER TABLE public.income_category_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages income hints"
  ON public.income_category_hints
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own income hints"
  ON public.income_category_hints FOR SELECT
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own income hints"
  ON public.income_category_hints FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update own income hints"
  ON public.income_category_hints FOR UPDATE
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete own income hints"
  ON public.income_category_hints FOR DELETE
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));