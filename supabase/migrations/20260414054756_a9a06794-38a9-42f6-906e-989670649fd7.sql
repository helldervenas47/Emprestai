CREATE TABLE public.webhook_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  webhook_url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  send_time text NOT NULL DEFAULT '08:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.webhook_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhook settings" ON public.webhook_settings
  FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert webhook settings" ON public.webhook_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update webhook settings" ON public.webhook_settings
  FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete webhook settings" ON public.webhook_settings
  FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));