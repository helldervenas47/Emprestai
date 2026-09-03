-- ============================================================================
-- Módulo: Gerenciamento manual de assinaturas (admin)
-- Rodar UMA vez no Supabase EXTERNO (projeto principal do app).
-- Idempotente: pode reexecutar sem quebrar.
-- ============================================================================

-- 1) Colunas de override manual em subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_override_by uuid NULL,
  ADD COLUMN IF NOT EXISTS manual_override_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS manual_note text NULL,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz NULL;

-- 2) Trial override em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_days_override integer NULL,
  ADD COLUMN IF NOT EXISTS subscription_manual_note text NULL;

-- 3) Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NULL,
  target_user_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb NULL,
  after jsonb NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_audit_log_target_idx
  ON public.subscription_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_audit_log_admin_idx
  ON public.subscription_audit_log (admin_user_id, created_at DESC);

-- 4) Grants + RLS (leitura só admin; escrita só service_role via edge function)
GRANT SELECT ON public.subscription_audit_log TO authenticated;
GRANT ALL ON public.subscription_audit_log TO service_role;

ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_read" ON public.subscription_audit_log;
CREATE POLICY "audit_admin_read"
  ON public.subscription_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Nenhuma policy de INSERT/UPDATE/DELETE: só service_role pode escrever.
