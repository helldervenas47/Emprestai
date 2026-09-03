
ALTER TABLE public.piggy_bank_deposits
  DROP CONSTRAINT IF EXISTS piggy_bank_deposits_expense_id_fkey;

ALTER TABLE public.piggy_bank_deposits
  ADD CONSTRAINT piggy_bank_deposits_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
