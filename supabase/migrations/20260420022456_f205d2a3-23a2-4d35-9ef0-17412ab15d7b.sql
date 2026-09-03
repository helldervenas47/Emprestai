-- Tabela de aprendizado: cache de palavras-chave → categoria por usuário
CREATE TABLE public.expense_category_hints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword, category)
);

CREATE INDEX idx_expense_category_hints_lookup
  ON public.expense_category_hints (user_id, keyword);

ALTER TABLE public.expense_category_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own category hints"
  ON public.expense_category_hints FOR SELECT
  TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own category hints"
  ON public.expense_category_hints FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update own category hints"
  ON public.expense_category_hints FOR UPDATE
  TO authenticated
  USING ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete own category hints"
  ON public.expense_category_hints FOR DELETE
  TO authenticated
  USING ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE POLICY "Service role manages category hints"
  ON public.expense_category_hints FOR ALL
  TO public
  USING (auth.role() = 'service_role'::text);