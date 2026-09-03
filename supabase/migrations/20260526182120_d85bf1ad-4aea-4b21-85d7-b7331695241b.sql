-- Substitui a restrição única para permitir múltiplas linhas de "Empréstimo concedido"
-- por contrato quando o desembolso for dividido em mais de um meio de pagamento.
DROP INDEX IF EXISTS public.uq_account_ledger_loan_creation;
CREATE UNIQUE INDEX uq_account_ledger_loan_creation
  ON public.account_ledger (user_id, loan_id, COALESCE(payment_method_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE category = 'loan' AND loan_id IS NOT NULL AND direction = 'out';

-- Backfill das partes faltantes
WITH loans_split AS (
  SELECT
    l.id AS loan_id, l.user_id, l.borrower_name, l.start_date, l.amount AS total_amount,
    (part->>'payment_method_id')::uuid AS pm_id,
    ((part->>'amount')::numeric) AS amt,
    (ord - 1) AS split_index,
    jsonb_array_length(l.payment_method_split->'parts') AS split_count
  FROM public.loans l
  CROSS JOIN LATERAL jsonb_array_elements(l.payment_method_split->'parts') WITH ORDINALITY AS t(part, ord)
  WHERE l.payment_method_split IS NOT NULL
),
missing AS (
  SELECT ls.* FROM loans_split ls
  WHERE NOT EXISTS (
    SELECT 1 FROM public.account_ledger al
    WHERE al.loan_id = ls.loan_id AND al.category = 'loan' AND al.direction = 'out'
      AND al.payment_method_id IS NOT DISTINCT FROM ls.pm_id AND al.amount = ls.amt
  )
)
INSERT INTO public.account_ledger (
  user_id, direction, category, amount, occurred_on, description,
  loan_id, source, metadata, wallet, payment_method_id
)
SELECT
  m.user_id, 'out', 'loan', m.amt, m.start_date,
  'Empréstimo concedido - ' || m.borrower_name,
  m.loan_id, 'auto',
  jsonb_build_object('split_part', true, 'split_index', m.split_index,
    'split_count', m.split_count, 'total_amount', m.total_amount, 'backfill_split', true),
  COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id = m.pm_id), 'account'),
  m.pm_id
FROM missing m;