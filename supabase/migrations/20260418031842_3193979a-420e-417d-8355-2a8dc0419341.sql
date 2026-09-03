-- Personal AI insights cache
CREATE TABLE public.personal_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month text NOT NULL,
  content text NOT NULL,
  summary text,
  exceeded_categories text[] NOT NULL DEFAULT '{}',
  trends jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE public.personal_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai insights"
  ON public.personal_ai_insights FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users insert own ai insights"
  ON public.personal_ai_insights FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users update own ai insights"
  ON public.personal_ai_insights FOR UPDATE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users delete own ai insights"
  ON public.personal_ai_insights FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Service role manages ai insights"
  ON public.personal_ai_insights FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER trg_personal_ai_insights_updated
  BEFORE UPDATE ON public.personal_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Telegram personal insights preferences
CREATE TABLE public.personal_insights_telegram_prefs (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  send_time_1 text,
  send_time_2 text,
  send_time_3 text,
  alert_on_exceed boolean NOT NULL DEFAULT true,
  alert_on_trend boolean NOT NULL DEFAULT true,
  last_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_insights_telegram_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own insights tg prefs"
  ON public.personal_insights_telegram_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own insights tg prefs"
  ON public.personal_insights_telegram_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own insights tg prefs"
  ON public.personal_insights_telegram_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own insights tg prefs"
  ON public.personal_insights_telegram_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages insights tg prefs"
  ON public.personal_insights_telegram_prefs FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER trg_personal_insights_telegram_prefs_updated
  BEFORE UPDATE ON public.personal_insights_telegram_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();