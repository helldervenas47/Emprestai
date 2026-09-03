
CREATE TABLE IF NOT EXISTS public.telegram_image_delivery_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reports jsonb NOT NULL DEFAULT '{}'::jsonb,
  include_text boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_image_delivery_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.telegram_image_delivery_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_insert" ON public.telegram_image_delivery_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update" ON public.telegram_image_delivery_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_delete" ON public.telegram_image_delivery_prefs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
