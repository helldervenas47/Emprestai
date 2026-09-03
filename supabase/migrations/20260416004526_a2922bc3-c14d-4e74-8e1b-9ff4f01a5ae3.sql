
CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push tokens"
ON public.push_tokens FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own push tokens"
ON public.push_tokens FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own push tokens"
ON public.push_tokens FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role can manage push tokens"
ON public.push_tokens FOR ALL
TO public
USING (auth.role() = 'service_role');
