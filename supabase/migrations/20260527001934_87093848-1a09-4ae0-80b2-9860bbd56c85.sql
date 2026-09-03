
ALTER TABLE public.my_boletos
  ADD COLUMN expense_id UUID NULL REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX my_boletos_expense_id_unique
  ON public.my_boletos(expense_id)
  WHERE expense_id IS NOT NULL;
