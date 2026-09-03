UPDATE public.balance b
SET
  account_amount = ROUND((COALESCE(b.account_amount, 0) - p.amount)::numeric, 2),
  cash_amount = ROUND((COALESCE(b.cash_amount, 0) + p.amount)::numeric, 2),
  amount = ROUND((COALESCE(b.amount, COALESCE(b.account_amount, 0) + COALESCE(b.cash_amount, 0)))::numeric, 2),
  updated_at = now()
FROM public.payments p
JOIN public.payment_methods pm ON pm.id = p.payment_method_id
JOIN public.account_ledger al ON al.payment_id = p.id
WHERE b.user_id = p.user_id
  AND p.id = 'a3a8d6db-14fb-47e2-8170-64548c5c6857'::uuid
  AND pm.kind = 'cash'
  AND al.wallet = 'cash';