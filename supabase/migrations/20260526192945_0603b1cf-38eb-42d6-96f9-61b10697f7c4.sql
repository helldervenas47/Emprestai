
CREATE TABLE public.my_boletos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  description TEXT NOT NULL,
  beneficiary TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  paid_at DATE,
  digits TEXT,
  barcode TEXT,
  bank_code TEXT,
  bank_name TEXT,
  segment TEXT,
  segment_label TEXT,
  kind TEXT,
  notes TEXT,
  attachment_path TEXT,
  pix_brcode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_my_boletos_owner ON public.my_boletos (owner_id, due_date);
CREATE INDEX idx_my_boletos_status ON public.my_boletos (owner_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_boletos TO authenticated;
GRANT ALL ON public.my_boletos TO service_role;

ALTER TABLE public.my_boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view my_boletos" ON public.my_boletos FOR SELECT TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));
CREATE POLICY "Owners insert my_boletos" ON public.my_boletos FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));
CREATE POLICY "Owners update my_boletos" ON public.my_boletos FOR UPDATE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));
CREATE POLICY "Owners delete my_boletos" ON public.my_boletos FOR DELETE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_my_boletos_updated_at
  BEFORE UPDATE ON public.my_boletos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('boleto-attachments', 'boleto-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners read own boleto attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'boleto-attachments' AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
CREATE POLICY "Owners upload own boleto attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boleto-attachments' AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
CREATE POLICY "Owners update own boleto attachments" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boleto-attachments' AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
CREATE POLICY "Owners delete own boleto attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boleto-attachments' AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
