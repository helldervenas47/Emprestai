CREATE TABLE public.user_telegram_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  bot_username TEXT,
  bot_id BIGINT,
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_telegram_bots_owner ON public.user_telegram_bots(owner_id);

ALTER TABLE public.user_telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_telegram_bots_select_own"
ON public.user_telegram_bots FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "user_telegram_bots_insert_own"
ON public.user_telegram_bots FOR INSERT
TO authenticated
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "user_telegram_bots_update_own"
ON public.user_telegram_bots FOR UPDATE
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "user_telegram_bots_delete_own"
ON public.user_telegram_bots FOR DELETE
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER user_telegram_bots_updated_at
BEFORE UPDATE ON public.user_telegram_bots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();