
CREATE TABLE public.my_boleto_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boleto_id UUID NOT NULL REFERENCES public.my_boletos(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  user_id UUID NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pago',
  notes TEXT,
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_my_boleto_payments_boleto ON public.my_boleto_payments(boleto_id);
CREATE INDEX idx_my_boleto_payments_owner ON public.my_boleto_payments(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_boleto_payments TO authenticated;
GRANT ALL ON public.my_boleto_payments TO service_role;

ALTER TABLE public.my_boleto_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view boleto payments"
  ON public.my_boleto_payments FOR SELECT
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Owners insert boleto payments"
  ON public.my_boleto_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = public.get_data_owner_id(auth.uid())
    AND user_id = auth.uid()
    AND public.can_write_data(auth.uid())
  );

CREATE POLICY "Owners update boleto payments"
  ON public.my_boleto_payments FOR UPDATE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owners delete boleto payments"
  ON public.my_boleto_payments FOR DELETE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));
