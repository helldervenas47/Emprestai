-- Configuração de cobrança automática por usuário
CREATE TABLE IF NOT EXISTS public.whatsapp_billing_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'whatsmiau',
  base_url TEXT NOT NULL DEFAULT '',
  instance_id TEXT NOT NULL DEFAULT '',
  send_time TEXT NOT NULL DEFAULT '09:00',
  days_before_due INTEGER NOT NULL DEFAULT 1,
  send_on_due_day BOOLEAN NOT NULL DEFAULT true,
  send_when_overdue BOOLEAN NOT NULL DEFAULT true,
  overdue_repeat_days INTEGER NOT NULL DEFAULT 3,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_billing_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own billing schedule"
ON public.whatsapp_billing_schedule FOR SELECT TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own billing schedule"
ON public.whatsapp_billing_schedule FOR INSERT TO authenticated
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update own billing schedule"
ON public.whatsapp_billing_schedule FOR UPDATE TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete own billing schedule"
ON public.whatsapp_billing_schedule FOR DELETE TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Service role manages billing schedule"
ON public.whatsapp_billing_schedule FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_whatsapp_billing_schedule_updated_at
BEFORE UPDATE ON public.whatsapp_billing_schedule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log de envios
CREATE TABLE IF NOT EXISTS public.whatsapp_billing_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  loan_id UUID NOT NULL,
  client_id UUID,
  installment_number INTEGER NOT NULL DEFAULT 0,
  status_when_sent TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  sent_date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbl_owner_date ON public.whatsapp_billing_log(owner_id, sent_date);
CREATE INDEX IF NOT EXISTS idx_wbl_loan_date ON public.whatsapp_billing_log(loan_id, sent_date);

ALTER TABLE public.whatsapp_billing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own billing log"
ON public.whatsapp_billing_log FOR SELECT TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Service role manages billing log"
ON public.whatsapp_billing_log FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can insert own billing log"
ON public.whatsapp_billing_log FOR INSERT TO authenticated
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));