CREATE TABLE public.chart_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month_label text NOT NULL,
  emprestado numeric DEFAULT 0,
  recebido numeric DEFAULT 0,
  juros numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_label)
);

ALTER TABLE public.chart_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chart overrides" ON public.chart_overrides
  FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert chart overrides" ON public.chart_overrides
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update chart overrides" ON public.chart_overrides
  FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete chart overrides" ON public.chart_overrides
  FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));