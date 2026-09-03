-- Create whatsapp_billing_schedule table
CREATE TABLE IF NOT EXISTS public.whatsapp_billing_schedule (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    enabled BOOLEAN DEFAULT false,
    provider TEXT DEFAULT 'whatsmiau',
    base_url TEXT,
    instance_id TEXT,
    send_time TEXT DEFAULT '09:00',
    days_before_due INTEGER DEFAULT 1,
    send_on_due_day BOOLEAN DEFAULT true,
    send_when_overdue BOOLEAN DEFAULT true,
    overdue_repeat_days INTEGER DEFAULT 3,
    last_run_at TIMESTAMP WITH TIME ZONE,
    manager_summary_enabled BOOLEAN DEFAULT false,
    manager_summary_day_of_week INTEGER DEFAULT 1,
    manager_summary_time TEXT DEFAULT '09:00',
    manager_last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create whatsapp_billing_log table
CREATE TABLE IF NOT EXISTS public.whatsapp_billing_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id),
    installment_number INTEGER,
    status_when_sent TEXT,
    phone TEXT,
    message TEXT,
    success BOOLEAN,
    error_message TEXT,
    sent_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update account_ledger with missing columns (based on LedgerEntry interface)
ALTER TABLE public.account_ledger ADD COLUMN IF NOT EXISTS transfer_group_id TEXT;
ALTER TABLE public.account_ledger ADD COLUMN IF NOT EXISTS wallet TEXT DEFAULT 'account' CHECK (wallet IN ('account', 'cash'));
ALTER TABLE public.account_ledger ADD COLUMN IF NOT EXISTS payment_method_id UUID;

-- Consistency check for monthly_opening_balances (ensure owner_id exists)
ALTER TABLE public.monthly_opening_balances ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_billing_schedule TO authenticated;
GRANT ALL ON public.whatsapp_billing_schedule TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_billing_log TO authenticated;
GRANT ALL ON public.whatsapp_billing_log TO service_role;

-- Enable RLS
ALTER TABLE public.whatsapp_billing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_billing_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own billing schedule" ON public.whatsapp_billing_schedule FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Users can manage their own billing logs" ON public.whatsapp_billing_log FOR ALL USING (auth.uid() = owner_id);
