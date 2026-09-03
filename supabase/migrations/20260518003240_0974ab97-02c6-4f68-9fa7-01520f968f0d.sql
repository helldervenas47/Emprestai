CREATE TABLE public.boleto_lookups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  digits TEXT NOT NULL,
  barcode TEXT,
  kind TEXT NOT NULL,
  bank_code TEXT,
  bank_name TEXT,
  segment TEXT,
  segment_label TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  label TEXT,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boleto_lookups_owner ON public.boleto_lookups(owner_id, parsed_at DESC);
CREATE UNIQUE INDEX uq_boleto_lookups_owner_digits ON public.boleto_lookups(owner_id, digits);

ALTER TABLE public.boleto_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their boleto lookups"
ON public.boleto_lookups FOR SELECT
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Owners can insert their boleto lookups"
ON public.boleto_lookups FOR INSERT
WITH CHECK (
  owner_id = public.get_data_owner_id(auth.uid())
  AND public.can_write_data(auth.uid())
);

CREATE POLICY "Owners can update their boleto lookups"
ON public.boleto_lookups FOR UPDATE
USING (owner_id = public.get_data_owner_id(auth.uid()))
WITH CHECK (
  owner_id = public.get_data_owner_id(auth.uid())
  AND public.can_write_data(auth.uid())
);

CREATE POLICY "Owners can delete their boleto lookups"
ON public.boleto_lookups FOR DELETE
USING (
  owner_id = public.get_data_owner_id(auth.uid())
  AND public.can_write_data(auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.boleto_lookups;
ALTER TABLE public.boleto_lookups REPLICA IDENTITY FULL;