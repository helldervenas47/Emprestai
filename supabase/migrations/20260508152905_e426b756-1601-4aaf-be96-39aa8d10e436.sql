CREATE TABLE IF NOT EXISTS public.piggy_bank_rate_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  piggy_bank_id UUID NOT NULL REFERENCES public.piggy_banks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  annual_rate NUMERIC NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbrh_bank ON public.piggy_bank_rate_history(piggy_bank_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_pbrh_user ON public.piggy_bank_rate_history(user_id);

ALTER TABLE public.piggy_bank_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbrh_select_own"
  ON public.piggy_bank_rate_history FOR SELECT
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "pbrh_insert_own"
  ON public.piggy_bank_rate_history FOR INSERT
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "pbrh_update_own"
  ON public.piggy_bank_rate_history FOR UPDATE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "pbrh_delete_own"
  ON public.piggy_bank_rate_history FOR DELETE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

-- Backfill: 1 linha por cofrinho com a taxa atual valendo desde a criação
INSERT INTO public.piggy_bank_rate_history (piggy_bank_id, user_id, annual_rate, effective_from)
SELECT pb.id, pb.user_id, pb.annual_rate, (pb.created_at AT TIME ZONE 'America/Sao_Paulo')::date
FROM public.piggy_banks pb
WHERE NOT EXISTS (
  SELECT 1 FROM public.piggy_bank_rate_history h WHERE h.piggy_bank_id = pb.id
);