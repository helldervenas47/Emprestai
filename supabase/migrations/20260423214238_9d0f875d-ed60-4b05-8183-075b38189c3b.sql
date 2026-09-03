
CREATE TABLE public.whatsapp_billing_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE,
  message_upcoming text NOT NULL DEFAULT 'Olá {nome}, seu pagamento de {valor} vence em {data_vencimento}. Evite juros pagando antecipadamente.',
  message_due_today text NOT NULL DEFAULT 'Olá {nome}, seu pagamento de {valor} vence hoje ({data_vencimento}). Por favor, regularize para evitar encargos.',
  message_overdue text NOT NULL DEFAULT 'Olá {nome}, identificamos um pagamento de {valor} em atraso desde {data_vencimento}. Entre em contato para regularização.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_billing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view whatsapp billing messages"
  ON public.whatsapp_billing_messages FOR SELECT TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert whatsapp billing messages"
  ON public.whatsapp_billing_messages FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update whatsapp billing messages"
  ON public.whatsapp_billing_messages FOR UPDATE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete whatsapp billing messages"
  ON public.whatsapp_billing_messages FOR DELETE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER set_whatsapp_billing_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_billing_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
