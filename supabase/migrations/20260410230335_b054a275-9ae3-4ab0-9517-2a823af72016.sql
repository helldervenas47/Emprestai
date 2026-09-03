
-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  rg TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  score TEXT NOT NULL DEFAULT '',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Loans table
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  borrower_name TEXT NOT NULL,
  borrower_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  interest_type TEXT NOT NULL DEFAULT 'Mensal',
  payment_type TEXT NOT NULL DEFAULT 'Parcelado',
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  paid_installments INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own loans" ON public.loans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own loans" ON public.loans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own loans" ON public.loans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own loans" ON public.loans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  installment_number INTEGER NOT NULL DEFAULT 0,
  previous_due_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own payments" ON public.payments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'fixa',
  category TEXT NOT NULL DEFAULT '',
  installments INTEGER,
  paid_installments INTEGER DEFAULT 0,
  due_date TEXT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expenses" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own expenses" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Balance table (one row per user)
CREATE TABLE public.balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance" ON public.balance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balance" ON public.balance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own balance" ON public.balance FOR UPDATE TO authenticated USING (auth.uid() = user_id);
