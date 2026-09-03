ALTER TABLE public.telegram_pending_piggy_aporte
  ADD COLUMN IF NOT EXISTS pending_amount numeric;

ALTER TABLE public.telegram_pending_piggy_aporte
  ALTER COLUMN piggy_bank_id DROP NOT NULL;