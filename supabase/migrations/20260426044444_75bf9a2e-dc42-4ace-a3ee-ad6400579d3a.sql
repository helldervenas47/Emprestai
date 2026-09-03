-- 1) Coluna no loans para acumular o total de multas de renegociação
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS renegotiation_penalty_total numeric NOT NULL DEFAULT 0;

-- 2) Tabela de histórico de renegociações
CREATE TABLE IF NOT EXISTS public.loan_renegotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  renegotiated_at text NOT NULL,
  type text NOT NULL CHECK (type IN ('no_interest', 'with_penalty')),
  previous_amount numeric NOT NULL DEFAULT 0,
  new_amount numeric NOT NULL DEFAULT 0,
  penalty_amount numeric NOT NULL DEFAULT 0,
  penalty_mode text CHECK (penalty_mode IN ('fixed', 'percentage')),
  penalty_input numeric,
  previous_installments integer,
  new_installments integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_renegotiations_loan_id ON public.loan_renegotiations(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_renegotiations_user_id ON public.loan_renegotiations(user_id);

ALTER TABLE public.loan_renegotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view loan_renegotiations"
  ON public.loan_renegotiations FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert loan_renegotiations"
  ON public.loan_renegotiations FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete loan_renegotiations"
  ON public.loan_renegotiations FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

-- Sem política UPDATE: histórico é imutável.