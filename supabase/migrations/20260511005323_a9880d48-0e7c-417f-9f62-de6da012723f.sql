CREATE TABLE public.incomes_expenses_telegram_prefs (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  send_time_1 text,
  send_time_2 text,
  send_time_3 text,
  send_target text NOT NULL DEFAULT 'tomorrow' CHECK (send_target IN ('today','tomorrow')),
  last_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incomes_expenses_telegram_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own incomes_expenses tg prefs"
  ON public.incomes_expenses_telegram_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own incomes_expenses tg prefs"
  ON public.incomes_expenses_telegram_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own incomes_expenses tg prefs"
  ON public.incomes_expenses_telegram_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own incomes_expenses tg prefs"
  ON public.incomes_expenses_telegram_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages incomes_expenses tg prefs"
  ON public.incomes_expenses_telegram_prefs FOR ALL TO public
  USING (auth.role() = 'service_role'::text);

CREATE TRIGGER update_incomes_expenses_telegram_prefs_updated_at
  BEFORE UPDATE ON public.incomes_expenses_telegram_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();