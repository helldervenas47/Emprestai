CREATE TABLE IF NOT EXISTS public.telegram_pending_piggy_aporte (
  chat_id bigint PRIMARY KEY,
  user_id uuid NOT NULL,
  piggy_bank_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_pending_piggy_aporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages pending piggy aporte"
  ON public.telegram_pending_piggy_aporte
  FOR ALL
  USING (auth.role() = 'service_role'::text);