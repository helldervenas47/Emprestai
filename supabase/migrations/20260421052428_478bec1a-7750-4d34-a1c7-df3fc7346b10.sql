CREATE TABLE public.telegram_accumulated_delinquency_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_time_1 TEXT NULL,
  send_time_2 TEXT NULL,
  send_time_3 TEXT NULL,
  last_sent JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_accumulated_delinquency_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own accumulated delinquency prefs"
ON public.telegram_accumulated_delinquency_prefs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert own accumulated delinquency prefs"
ON public.telegram_accumulated_delinquency_prefs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own accumulated delinquency prefs"
ON public.telegram_accumulated_delinquency_prefs
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own accumulated delinquency prefs"
ON public.telegram_accumulated_delinquency_prefs
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role manages accumulated delinquency prefs"
ON public.telegram_accumulated_delinquency_prefs
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_telegram_accumulated_delinquency_prefs_updated_at
BEFORE UPDATE ON public.telegram_accumulated_delinquency_prefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();