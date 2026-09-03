
-- Global system-wide Telegram bots (shared across all accounts).
-- Only admins can manage. Edge functions read via service role.
CREATE TABLE public.system_telegram_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  purpose TEXT NOT NULL DEFAULT 'general' CHECK (purpose IN ('reports','expenses','general')),
  bot_id BIGINT,
  bot_username TEXT,
  validation_status TEXT,
  last_validated_at TIMESTAMPTZ,
  update_offset BIGINT NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_telegram_bots ENABLE ROW LEVEL SECURITY;

-- Only admins can view tokens / manage bots from the client.
CREATE POLICY "Admins can view system bots"
  ON public.system_telegram_bots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system bots"
  ON public.system_telegram_bots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system bots"
  ON public.system_telegram_bots FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system bots"
  ON public.system_telegram_bots FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_system_telegram_bots_updated_at
  BEFORE UPDATE ON public.system_telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate any previously registered per-user bots into the global table
-- (deduplicated by token), so existing setups keep working.
INSERT INTO public.system_telegram_bots
  (name, token, description, active, purpose, bot_id, bot_username,
   validation_status, last_validated_at, update_offset, last_polled_at, created_by)
SELECT DISTINCT ON (token)
  name, token, description, active, COALESCE(purpose,'general'),
  bot_id, bot_username, validation_status, last_validated_at,
  COALESCE(update_offset,0), last_polled_at, owner_id
FROM public.user_telegram_bots
ORDER BY token, created_at ASC;
