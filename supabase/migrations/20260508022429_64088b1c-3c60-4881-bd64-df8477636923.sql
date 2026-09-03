
CREATE TABLE public.incomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  category TEXT,
  client_id UUID,
  source TEXT,
  payment_method_id UUID,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'once',
  parent_id UUID,
  ledger_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incomes_user_id ON public.incomes(user_id);
CREATE INDEX idx_incomes_received_date ON public.incomes(received_date);
CREATE INDEX idx_incomes_status ON public.incomes(status);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view incomes"
ON public.incomes FOR SELECT
USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Owners can insert incomes"
ON public.incomes FOR INSERT
WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owners can update incomes"
ON public.incomes FOR UPDATE
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owners can delete incomes"
ON public.incomes FOR DELETE
USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_incomes_updated_at
BEFORE UPDATE ON public.incomes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.incomes;
ALTER TABLE public.incomes REPLICA IDENTITY FULL;
