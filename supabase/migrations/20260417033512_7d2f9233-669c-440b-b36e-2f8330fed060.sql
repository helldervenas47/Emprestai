-- 1. Flag de gerente em clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

-- 2. Campos de gerente em loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS has_manager boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS manager_commission_rate numeric NOT NULL DEFAULT 10;

-- 3. Tabela isolada de comissões (apenas para visualização)
CREATE TABLE IF NOT EXISTS public.manager_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  manager_id uuid NOT NULL,
  payment_id uuid,
  commission_type text NOT NULL DEFAULT 'interest', -- 'interest' | 'full'
  base_amount numeric NOT NULL DEFAULT 0,           -- valor original do empréstimo
  rate numeric NOT NULL DEFAULT 10,                  -- % aplicado
  amount numeric NOT NULL DEFAULT 0,                 -- comissão calculada
  generated_at text NOT NULL,                        -- data do pagamento que gerou
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view manager_commissions"
ON public.manager_commissions FOR SELECT
TO authenticated
USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert manager_commissions"
ON public.manager_commissions FOR INSERT
TO authenticated
WITH CHECK ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update manager_commissions"
ON public.manager_commissions FOR UPDATE
TO authenticated
USING ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete manager_commissions"
ON public.manager_commissions FOR DELETE
TO authenticated
USING ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_manager_commissions_user ON public.manager_commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_manager ON public.manager_commissions(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_loan ON public.manager_commissions(loan_id);