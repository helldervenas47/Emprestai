ALTER TABLE public.chart_overrides
ADD COLUMN juros_manual boolean NOT NULL DEFAULT false;

UPDATE public.chart_overrides
SET juros_manual = (juros <> 0);

DROP POLICY IF EXISTS "Users can view own chart overrides" ON public.chart_overrides;
DROP POLICY IF EXISTS "Users can insert chart overrides" ON public.chart_overrides;
DROP POLICY IF EXISTS "Users can update chart overrides" ON public.chart_overrides;
DROP POLICY IF EXISTS "Users can delete chart overrides" ON public.chart_overrides;

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