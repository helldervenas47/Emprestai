
-- Tabela: limite atual por cliente
CREATE TABLE public.credit_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL UNIQUE,
  current_limit NUMERIC NOT NULL DEFAULT 300,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
  last_auto_calculated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_limits_user ON public.credit_limits(user_id);
CREATE INDEX idx_credit_limits_client ON public.credit_limits(client_id);

ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credit_limits"
  ON public.credit_limits FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert credit_limits"
  ON public.credit_limits FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update credit_limits"
  ON public.credit_limits FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete credit_limits"
  ON public.credit_limits FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Service role manages credit_limits"
  ON public.credit_limits FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_credit_limits_updated_at
  BEFORE UPDATE ON public.credit_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: histórico de mudanças
CREATE TABLE public.credit_limit_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('manual', 'automatic', 'initial')),
  previous_limit NUMERIC NOT NULL DEFAULT 0,
  new_limit NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  changed_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_limit_history_client ON public.credit_limit_history(client_id, created_at DESC);
CREATE INDEX idx_credit_limit_history_user ON public.credit_limit_history(user_id);

ALTER TABLE public.credit_limit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credit_limit_history"
  ON public.credit_limit_history FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert credit_limit_history"
  ON public.credit_limit_history FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Service role manages credit_limit_history"
  ON public.credit_limit_history FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
