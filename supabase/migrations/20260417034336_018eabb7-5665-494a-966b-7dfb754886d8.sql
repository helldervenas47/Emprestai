-- Add recurrence fields to piggy_bank_deposits and a recurrence-template table
ALTER TABLE public.piggy_bank_deposits
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS recurrence_id UUID;

CREATE TABLE IF NOT EXISTS public.piggy_bank_recurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  piggy_bank_id UUID NOT NULL REFERENCES public.piggy_banks(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT,
  day_of_month SMALLINT NOT NULL DEFAULT 1,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.piggy_bank_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view piggy_recurrences" ON public.piggy_bank_recurrences
  FOR SELECT TO authenticated USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert piggy_recurrences" ON public.piggy_bank_recurrences
  FOR INSERT TO authenticated WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update piggy_recurrences" ON public.piggy_bank_recurrences
  FOR UPDATE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete piggy_recurrences" ON public.piggy_bank_recurrences
  FOR DELETE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_piggy_bank_recurrences_updated_at
  BEFORE UPDATE ON public.piggy_bank_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();