CREATE TABLE public.credit_card_invoice_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  cycle_key text NOT NULL,
  opening_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, cycle_key)
);

CREATE INDEX idx_cc_inv_openings_user ON public.credit_card_invoice_openings (user_id);
CREATE INDEX idx_cc_inv_openings_card ON public.credit_card_invoice_openings (card_id);

ALTER TABLE public.credit_card_invoice_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice openings"
ON public.credit_card_invoice_openings FOR SELECT TO authenticated
USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert invoice openings"
ON public.credit_card_invoice_openings FOR INSERT TO authenticated
WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update invoice openings"
ON public.credit_card_invoice_openings FOR UPDATE TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete invoice openings"
ON public.credit_card_invoice_openings FOR DELETE TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_cc_inv_openings_updated_at
BEFORE UPDATE ON public.credit_card_invoice_openings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();