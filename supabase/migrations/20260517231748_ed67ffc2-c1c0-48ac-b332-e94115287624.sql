-- =========================
-- EMPLOYEES
-- =========================
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  cpf TEXT,
  role TEXT,
  department TEXT,
  registration TEXT,
  hire_date DATE,
  status TEXT NOT NULL DEFAULT 'ativo',
  photo_url TEXT,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'mensal',
  hourly_rate NUMERIC,
  commission_percent NUMERIC,
  bank TEXT,
  agency TEXT,
  account TEXT,
  pix_key TEXT,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX employees_user_id_idx ON public.employees(user_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees: select own/visible"
  ON public.employees FOR SELECT
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Employees: insert own"
  ON public.employees FOR INSERT
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Employees: update own"
  ON public.employees FOR UPDATE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Employees: delete own"
  ON public.employees FOR DELETE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- PAYROLLS
-- =========================
CREATE TABLE public.payrolls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  competence TEXT NOT NULL,
  gross_salary NUMERIC NOT NULL DEFAULT 0,
  total_benefits NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_salary NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  due_date DATE,
  paid_date DATE,
  payment_method_id UUID,
  expense_id UUID,
  closed BOOLEAN NOT NULL DEFAULT false,
  items JSONB NOT NULL DEFAULT '{"earnings":[],"deductions":[]}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, competence)
);

CREATE INDEX payrolls_user_id_idx ON public.payrolls(user_id);
CREATE INDEX payrolls_competence_idx ON public.payrolls(competence);

ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payrolls: select own/visible"
  ON public.payrolls FOR SELECT
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Payrolls: insert own"
  ON public.payrolls FOR INSERT
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Payrolls: update own"
  ON public.payrolls FOR UPDATE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Payrolls: delete own"
  ON public.payrolls FOR DELETE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER payrolls_updated_at
  BEFORE UPDATE ON public.payrolls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- PAYROLL PAYMENTS
-- =========================
CREATE TABLE public.payroll_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  payroll_id UUID NOT NULL REFERENCES public.payrolls(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method_id UUID,
  expense_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payroll_payments_payroll_idx ON public.payroll_payments(payroll_id);

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PayrollPayments: select own/visible"
  ON public.payroll_payments FOR SELECT
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "PayrollPayments: insert own"
  ON public.payroll_payments FOR INSERT
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "PayrollPayments: update own"
  ON public.payroll_payments FOR UPDATE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "PayrollPayments: delete own"
  ON public.payroll_payments FOR DELETE
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));