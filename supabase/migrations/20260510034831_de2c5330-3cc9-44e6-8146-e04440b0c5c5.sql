-- Apaga a ocorrência duplicada (filha recebida em 2026-05-09 que originalmente era 2026-05-30)
DELETE FROM public.incomes WHERE id = '891fec4f-02e1-4054-83d1-91c952581e2e';

-- Marca a parcela-mãe (data 2026-05-09) como recebida
UPDATE public.incomes
SET status = 'received'
WHERE id = '0e63757a-5921-462a-a7f6-97fd040c4f10';

-- Recria a ocorrência semanal que faltou em 2026-05-30
INSERT INTO public.incomes (
  user_id, description, amount, category, client_id, source,
  payment_method_id, received_date, status, notes, recurrence, parent_id
)
SELECT
  user_id, description, amount, category, client_id, source,
  payment_method_id, '2026-05-30'::date, 'pending', NULL, 'once', id
FROM public.incomes
WHERE id = '0e63757a-5921-462a-a7f6-97fd040c4f10';