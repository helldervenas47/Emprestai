UPDATE public.loans l
SET due_date = li.due_date
FROM public.loan_installments li
WHERE li.loan_id = l.id
  AND li.installment_number = l.paid_installments + 1
  AND l.status = 'active'
  AND l.paid_installments > 0
  AND l.paid_installments < l.installments
  AND l.due_date <> li.due_date;