
CREATE TABLE public.whatsapp_assistant_authorized (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  phone text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, phone)
);

ALTER TABLE public.whatsapp_assistant_authorized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own authorized numbers"
ON public.whatsapp_assistant_authorized FOR SELECT TO authenticated
USING (owner_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users insert own authorized numbers"
ON public.whatsapp_assistant_authorized FOR INSERT TO authenticated
WITH CHECK (owner_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users update own authorized numbers"
ON public.whatsapp_assistant_authorized FOR UPDATE TO authenticated
USING (owner_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users delete own authorized numbers"
ON public.whatsapp_assistant_authorized FOR DELETE TO authenticated
USING (owner_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Service role manages authorized numbers"
ON public.whatsapp_assistant_authorized FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.whatsapp_assistant_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  phone text NOT NULL,
  direction text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_assistant_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own assistant logs"
ON public.whatsapp_assistant_log FOR SELECT TO authenticated
USING (owner_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Service role manages assistant logs"
ON public.whatsapp_assistant_log FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_wa_assistant_log_owner_date ON public.whatsapp_assistant_log(owner_id, created_at DESC);
CREATE INDEX idx_wa_assistant_auth_phone ON public.whatsapp_assistant_authorized(phone);
