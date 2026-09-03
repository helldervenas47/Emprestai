
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  send_time text NOT NULL DEFAULT '08:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notification preferences"
ON public.notification_preferences FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
