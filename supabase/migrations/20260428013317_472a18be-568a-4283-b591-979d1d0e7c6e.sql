-- 1) Tabela do extrato unificado
CREATE TABLE IF NOT EXISTS public.account_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  category TEXT NOT NULL CHECK (category IN ('loan','payment','expense','adjustment','aporte','sale','initial','other')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  occurred_on TEXT NOT NULL, -- 'YYYY-MM-DD' (mesma convenção do resto do app)
  description TEXT NOT NULL DEFAULT '',
  loan_id UUID,
  expense_id UUID,
  payment_id UUID,
  source TEXT NOT NULL DEFAULT 'manual', -- 'auto' | 'manual' | 'backfill'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_ledger_user_date ON public.account_ledger (user_id, occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_ledger_loan ON public.account_ledger (loan_id) WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_ledger_expense ON public.account_ledger (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_ledger_payment ON public.account_ledger (payment_id) WHERE payment_id IS NOT NULL;

-- Evita duplicação ao gerar lançamentos automáticos a partir de loans/payments/expenses
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_ledger_loan_creation
  ON public.account_ledger (user_id, loan_id) WHERE category = 'loan' AND loan_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_ledger_payment
  ON public.account_ledger (user_id, payment_id) WHERE category = 'payment' AND payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_ledger_expense_paid
  ON public.account_ledger (user_id, expense_id) WHERE category = 'expense' AND expense_id IS NOT NULL;

ALTER TABLE public.account_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger"
  ON public.account_ledger FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert own ledger"
  ON public.account_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update own ledger"
  ON public.account_ledger FOR UPDATE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete own ledger"
  ON public.account_ledger FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER trg_account_ledger_updated_at
  BEFORE UPDATE ON public.account_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill: empréstimos -> saída
INSERT INTO public.account_ledger (user_id, direction, category, amount, occurred_on, description, loan_id, source, metadata)
SELECT
  l.user_id,
  'out',
  'loan',
  l.amount,
  COALESCE(NULLIF(l.start_date,''), to_char(l.created_at, 'YYYY-MM-DD')),
  'Empréstimo concedido - ' || l.borrower_name,
  l.id,
  'backfill',
  jsonb_build_object('backfill', true)
FROM public.loans l
ON CONFLICT DO NOTHING;

-- 3) Backfill: pagamentos -> entrada
INSERT INTO public.account_ledger (user_id, direction, category, amount, occurred_on, description, loan_id, payment_id, source, metadata)
SELECT
  p.user_id,
  'in',
  'payment',
  p.amount,
  COALESCE(NULLIF(p.date,''), to_char(p.created_at, 'YYYY-MM-DD')),
  'Parcela recebida' || COALESCE(' - ' || l.borrower_name, ''),
  p.loan_id,
  p.id,
  'backfill',
  jsonb_build_object('backfill', true, 'installment_number', p.installment_number)
FROM public.payments p
LEFT JOIN public.loans l ON l.id = p.loan_id
ON CONFLICT DO NOTHING;

-- 4) Backfill: despesas pagas (business) -> saída
INSERT INTO public.account_ledger (user_id, direction, category, amount, occurred_on, description, expense_id, source, metadata)
SELECT
  e.user_id,
  'out',
  'expense',
  e.amount,
  COALESCE(NULLIF(e.paid_date,''), NULLIF(e.due_date,''), to_char(e.created_at, 'YYYY-MM-DD')),
  'Despesa - ' || e.description,
  e.id,
  'backfill',
  jsonb_build_object('backfill', true, 'category', e.category, 'scope', e.scope)
FROM public.expenses e
WHERE e.paid = true
  AND COALESCE(e.scope, 'business') = 'business'
ON CONFLICT DO NOTHING;

-- 5) Backfill: ajuste de "Saldo inicial" para reconciliar com a tabela balance atual.
-- Calcula: saldo_atual - (entradas - saidas dos lançamentos automáticos acima) e cria 1 lançamento de ajuste.
WITH agg AS (
  SELECT
    b.user_id,
    b.amount AS current_balance,
    COALESCE(SUM(CASE WHEN al.direction = 'in' THEN al.amount ELSE -al.amount END), 0) AS computed
  FROM public.balance b
  LEFT JOIN public.account_ledger al ON al.user_id = b.user_id
  GROUP BY b.user_id, b.amount
)
INSERT INTO public.account_ledger (user_id, direction, category, amount, occurred_on, description, source, metadata)
SELECT
  agg.user_id,
  CASE WHEN (agg.current_balance - agg.computed) >= 0 THEN 'in' ELSE 'out' END,
  'initial',
  ABS(agg.current_balance - agg.computed),
  to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'),
  'Saldo inicial (migração do extrato)',
  'backfill',
  jsonb_build_object('backfill', true, 'kind', 'initial_reconciliation')
FROM agg
WHERE ABS(agg.current_balance - agg.computed) > 0.005;