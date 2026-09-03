ALTER TABLE public.telegram_summary_prefs
  ADD COLUMN IF NOT EXISTS monthly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_send_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS monthly_send_day smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_monthly_sent_month text;