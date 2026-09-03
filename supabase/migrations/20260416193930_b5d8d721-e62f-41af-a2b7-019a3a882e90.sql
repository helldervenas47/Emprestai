ALTER TABLE public.personal_budget_alerts ADD COLUMN IF NOT EXISTS alert_type text NOT NULL DEFAULT 'exceeded';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_budget_alerts_user_id_category_month_key') THEN
    ALTER TABLE public.personal_budget_alerts DROP CONSTRAINT personal_budget_alerts_user_id_category_month_key;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS personal_budget_alerts_unique_idx ON public.personal_budget_alerts(user_id, category, month, alert_type);