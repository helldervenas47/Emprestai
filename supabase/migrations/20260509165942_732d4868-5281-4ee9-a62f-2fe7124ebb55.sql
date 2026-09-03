
ALTER TABLE public.user_telegram_bots
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS update_offset bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.user_telegram_bots
    ADD CONSTRAINT user_telegram_bots_purpose_check
    CHECK (purpose IN ('reports','expenses','general'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_user_telegram_bots_purpose_active
  ON public.user_telegram_bots (owner_id, purpose, active);
