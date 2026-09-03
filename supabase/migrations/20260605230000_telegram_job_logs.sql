-- Logs de execução dos jobs do Telegram (webhook, poll, cron)
CREATE TABLE IF NOT EXISTS public.telegram_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  bot_id uuid NULL,
  ok boolean NOT NULL,
  processed integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error text NULL,
  details jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_job_logs_job_created
  ON public.telegram_job_logs (job, created_at DESC);

GRANT SELECT ON public.telegram_job_logs TO authenticated;
GRANT ALL ON public.telegram_job_logs TO service_role;

ALTER TABLE public.telegram_job_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins read telegram job logs"
    ON public.telegram_job_logs FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.system_telegram_bots
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleanup_telegram_job_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.telegram_job_logs WHERE created_at < now() - interval '7 days';
$$;
