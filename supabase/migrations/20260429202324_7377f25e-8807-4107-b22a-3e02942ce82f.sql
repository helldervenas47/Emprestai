-- 1) Add 'gerente' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';

-- 2) Extend whatsapp_billing_messages
ALTER TABLE public.whatsapp_billing_messages
  ADD COLUMN IF NOT EXISTS message_very_overdue text,
  ADD COLUMN IF NOT EXISTS message_manager_weekly text,
  ADD COLUMN IF NOT EXISTS pix_link text,
  ADD COLUMN IF NOT EXISTS very_overdue_days integer NOT NULL DEFAULT 30;

-- 3) Extend whatsapp_billing_schedule with manager summary settings
ALTER TABLE public.whatsapp_billing_schedule
  ADD COLUMN IF NOT EXISTS manager_summary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_summary_day_of_week smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS manager_summary_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS manager_last_run_at timestamptz;

-- 4) Manager billing log
CREATE TABLE IF NOT EXISTS public.whatsapp_manager_billing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  manager_user_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  loans_count integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  sent_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wmbl_owner_date
  ON public.whatsapp_manager_billing_log(owner_id, sent_date);

ALTER TABLE public.whatsapp_manager_billing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers log: owner can select"
ON public.whatsapp_manager_billing_log FOR SELECT TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers log: service role full"
ON public.whatsapp_manager_billing_log FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Managers log: owner can insert"
ON public.whatsapp_manager_billing_log FOR INSERT TO authenticated
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()));