CREATE TABLE IF NOT EXISTS public.app_internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_internal_config ENABLE ROW LEVEL SECURITY;
-- sem policies: só service_role acessa

INSERT INTO public.app_internal_config (key, value)
VALUES ('backup_cron_token', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;