
CREATE TABLE public.telegram_billing_prefs (
  user_id uuid NOT NULL PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  send_time_1 text,
  send_time_2 text,
  send_time_3 text,
  last_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_billing_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages billing prefs"
  ON public.telegram_billing_prefs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own billing prefs"
  ON public.telegram_billing_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own billing prefs"
  ON public.telegram_billing_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own billing prefs"
  ON public.telegram_billing_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own billing prefs"
  ON public.telegram_billing_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_telegram_billing_prefs_updated_at
  BEFORE UPDATE ON public.telegram_billing_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
