CREATE TABLE public.telegram_summary_prefs (
  user_id UUID PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_time TEXT NOT NULL DEFAULT '19:00',
  last_sent_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_summary_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own summary prefs" ON public.telegram_summary_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own summary prefs" ON public.telegram_summary_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own summary prefs" ON public.telegram_summary_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own summary prefs" ON public.telegram_summary_prefs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages summary prefs" ON public.telegram_summary_prefs
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_telegram_summary_prefs_updated
  BEFORE UPDATE ON public.telegram_summary_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();