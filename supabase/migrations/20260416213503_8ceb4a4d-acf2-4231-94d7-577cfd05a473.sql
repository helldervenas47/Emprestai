ALTER TABLE public.telegram_summary_prefs
  ADD COLUMN IF NOT EXISTS weekly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_send_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS weekly_send_weekday smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_weekly_sent_date text;