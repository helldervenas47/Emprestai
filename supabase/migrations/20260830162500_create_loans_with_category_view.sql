-- View para calcular dados computados de Empréstimos (Paginação no Servidor)
-- Esta view usa WITH (security_invoker = on) para respeitar as regras de RLS da tabela 'loans'.

CREATE OR REPLACE VIEW public.loans_with_category WITH (security_invoker = on) AS
SELECT 
  l.*,
  COALESCE(
    (
      SELECT s.due_date 
      FROM public.loan_installments s 
      WHERE s.loan_id = l.id AND s.installment_number = (l.paid_installments + 1)
      LIMIT 1
    ),
    l.due_date
  ) AS computed_next_due_date,
  (
    SELECT p.installment_number 
    FROM public.payments p 
    WHERE p.loan_id = l.id 
    ORDER BY p.date DESC, p.created_at DESC 
    LIMIT 1
  ) AS last_payment_installment,
  CASE 
    WHEN l.status = 'paid' THEN 'paid'
    WHEN CURRENT_DATE::text > COALESCE(
      (SELECT s.due_date FROM public.loan_installments s WHERE s.loan_id = l.id AND s.installment_number = (l.paid_installments + 1) LIMIT 1),
      l.due_date
    ) THEN 'overdue'
    WHEN CURRENT_DATE::text = COALESCE(
      (SELECT s.due_date FROM public.loan_installments s WHERE s.loan_id = l.id AND s.installment_number = (l.paid_installments + 1) LIMIT 1),
      l.due_date
    ) THEN 'due_today'
    WHEN CURRENT_DATE::text < COALESCE(
      (SELECT s.due_date FROM public.loan_installments s WHERE s.loan_id = l.id AND s.installment_number = (l.paid_installments + 1) LIMIT 1),
      l.due_date
    ) AND (
      SELECT p.installment_number FROM public.payments p WHERE p.loan_id = l.id ORDER BY p.date DESC, p.created_at DESC LIMIT 1
    ) = 0 THEN 'paid_interest'
    ELSE 'on_track'
  END AS computed_category
FROM public.loans l;
