
CREATE TABLE public.monthly_opening_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, month)
);

ALTER TABLE public.monthly_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View monthly opening balances"
  ON public.monthly_opening_balances FOR SELECT
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Insert monthly opening balances"
  ON public.monthly_opening_balances FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Update monthly opening balances"
  ON public.monthly_opening_balances FOR UPDATE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Delete monthly opening balances"
  ON public.monthly_opening_balances FOR DELETE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_monthly_opening_balances_updated_at
  BEFORE UPDATE ON public.monthly_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
