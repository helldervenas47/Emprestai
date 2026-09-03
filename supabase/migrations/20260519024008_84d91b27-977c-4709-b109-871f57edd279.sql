DROP INDEX IF EXISTS public.uq_account_ledger_payment;
CREATE UNIQUE INDEX uq_account_ledger_payment
  ON public.account_ledger (user_id, payment_id, COALESCE(payment_method_id::text, ''))
  WHERE category = 'payment' AND payment_id IS NOT NULL;