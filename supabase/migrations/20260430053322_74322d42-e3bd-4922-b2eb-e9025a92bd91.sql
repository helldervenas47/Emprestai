ALTER TABLE public.telegram_summary_prefs
  ADD COLUMN IF NOT EXISTS monthly_format text NOT NULL DEFAULT 'text'
  CHECK (monthly_format IN ('text','image'));