CREATE TABLE public.accountant_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  period_start text,
  period_end text,
  confidence_score numeric NOT NULL DEFAULT 100,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accountant_audit_logs_user_executed
  ON public.accountant_audit_logs (user_id, executed_at DESC);

ALTER TABLE public.accountant_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs"
  ON public.accountant_audit_logs
  FOR SELECT
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own audit logs"
  ON public.accountant_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete own audit logs"
  ON public.accountant_audit_logs
  FOR DELETE
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));