ALTER TABLE public.daily_planning_telegram_prefs
ADD COLUMN IF NOT EXISTS send_target text NOT NULL DEFAULT 'tomorrow'
CHECK (send_target IN ('today', 'tomorrow'));