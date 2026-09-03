CREATE TABLE public.user_goal_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  selected TEXT[] NOT NULL DEFAULT '{}',
  order_list TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_goal_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own goal prefs"
  ON public.user_goal_prefs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own goal prefs"
  ON public.user_goal_prefs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own goal prefs"
  ON public.user_goal_prefs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own goal prefs"
  ON public.user_goal_prefs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_user_goal_prefs_updated_at
  BEFORE UPDATE ON public.user_goal_prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();