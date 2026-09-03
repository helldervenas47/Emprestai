
CREATE TABLE public.piggy_banks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '210 80% 55%',
  icon text NOT NULL DEFAULT 'PiggyBank',
  annual_rate numeric NOT NULL DEFAULT 11.15,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.piggy_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view piggy_banks" ON public.piggy_banks
  FOR SELECT TO authenticated USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert piggy_banks" ON public.piggy_banks
  FOR INSERT TO authenticated WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update piggy_banks" ON public.piggy_banks
  FOR UPDATE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete piggy_banks" ON public.piggy_banks
  FOR DELETE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER trg_piggy_banks_updated
  BEFORE UPDATE ON public.piggy_banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.piggy_bank_deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  piggy_bank_id uuid NOT NULL REFERENCES public.piggy_banks(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  deposit_date text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_piggy_deposits_pb ON public.piggy_bank_deposits(piggy_bank_id);
CREATE INDEX idx_piggy_deposits_user ON public.piggy_bank_deposits(user_id);

ALTER TABLE public.piggy_bank_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view piggy_deposits" ON public.piggy_bank_deposits
  FOR SELECT TO authenticated USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert piggy_deposits" ON public.piggy_bank_deposits
  FOR INSERT TO authenticated WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update piggy_deposits" ON public.piggy_bank_deposits
  FOR UPDATE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete piggy_deposits" ON public.piggy_bank_deposits
  FOR DELETE TO authenticated USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
