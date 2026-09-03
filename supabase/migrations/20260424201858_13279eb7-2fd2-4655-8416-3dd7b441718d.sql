ALTER TABLE public.telegram_reports_bot_state
  ADD COLUMN IF NOT EXISTS last_webhook_recovery_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_recovery_count int NOT NULL DEFAULT 0;