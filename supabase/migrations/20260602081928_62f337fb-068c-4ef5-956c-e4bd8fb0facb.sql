-- Create manager_commissions table
CREATE TABLE IF NOT EXISTS public.manager_commissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES auth.users(id),
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create locador_info table
CREATE TABLE IF NOT EXISTS public.locador_info (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    nome TEXT,
    rg TEXT,
    cpf TEXT,
    nacionalidade TEXT,
    profissao TEXT,
    endereco TEXT,
    bairro TEXT,
    cidade TEXT,
    estado TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update loans table
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS custom_installment_value DECIMAL(12,2);

-- Final consistency check for balance_adjustments, credit_card_invoice_openings, monthly_goal_snapshots
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES public.credit_cards(id);
ALTER TABLE public.credit_card_invoice_openings ADD COLUMN IF NOT EXISTS month_label TEXT;
ALTER TABLE public.monthly_goal_snapshots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_commissions TO authenticated;
GRANT ALL ON public.manager_commissions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locador_info TO authenticated;
GRANT ALL ON public.locador_info TO service_role;

-- Enable RLS
ALTER TABLE public.manager_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locador_info ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own manager commissions" ON public.manager_commissions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own locador info" ON public.locador_info FOR ALL USING (auth.uid() = user_id);
