
-- Sincroniza occurred_on dos lançamentos do extrato com a data real do pagamento
UPDATE public.account_ledger AS al
SET occurred_on = p.date
FROM public.payments AS p
WHERE al.payment_id = p.id
  AND al.occurred_on <> p.date;

-- Sincroniza occurred_on dos lançamentos de "Empréstimo concedido" com start_date do contrato
UPDATE public.account_ledger AS al
SET occurred_on = l.start_date
FROM public.loans AS l
WHERE al.loan_id = l.id
  AND al.category = 'loan'
  AND COALESCE(NULLIF(l.start_date, ''), '') <> ''
  AND al.occurred_on <> l.start_date;
