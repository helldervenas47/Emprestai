-- Backup automático diário no Google Drive
ALTER TABLE public.account_settings
  ADD COLUMN IF NOT EXISTS auto_backup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_auto_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_backup_drive_url text,
  ADD COLUMN IF NOT EXISTS backup_drive_folder_id text;

CREATE TABLE IF NOT EXISTS public.backup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  drive_file_id text,
  drive_url text,
  filename text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'success', -- success | error
  error text,
  triggered_by text NOT NULL DEFAULT 'cron' -- cron | manual
);

CREATE INDEX IF NOT EXISTS idx_backup_history_owner_created ON public.backup_history(owner_id, created_at DESC);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own backup history"
ON public.backup_history FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

-- Inserts são feitos pelas edge functions com service_role; sem policy de insert pública.

-- Habilita extensões para o cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;