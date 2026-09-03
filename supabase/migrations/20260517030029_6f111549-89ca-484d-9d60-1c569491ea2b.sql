
CREATE TABLE IF NOT EXISTS public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  adjustment_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  previous_amount numeric NOT NULL DEFAULT 0,
  adjusted_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, adjustment_date)
);

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View balance adjustments"
  ON public.balance_adjustments FOR SELECT
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Insert balance adjustments"
  ON public.balance_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Update balance adjustments"
  ON public.balance_adjustments FOR UPDATE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Delete balance adjustments"
  ON public.balance_adjustments FOR DELETE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_balance_adjustments_updated_at
  BEFORE UPDATE ON public.balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar dados antigos: cada saldo de abertura de mês vira um ajuste no dia 01.
INSERT INTO public.balance_adjustments (owner_id, adjustment_date, amount, previous_amount)
SELECT owner_id, (month || '-01')::date, amount, amount
FROM public.monthly_opening_balances
ON CONFLICT (owner_id, adjustment_date) DO NOTHING;
