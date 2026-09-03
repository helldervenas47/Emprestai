CREATE TABLE public.system_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_audit_logs_owner_created ON public.system_audit_logs (owner_id, created_at DESC);
CREATE INDEX idx_system_audit_logs_action ON public.system_audit_logs (action);

GRANT SELECT ON public.system_audit_logs TO authenticated;
GRANT ALL ON public.system_audit_logs TO service_role;

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own audit logs"
ON public.system_audit_logs
FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));
