-- Update products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS suggested_stock INTEGER DEFAULT 0;

-- Create sales table
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    business_type TEXT DEFAULT 'venda',
    payment_mode TEXT DEFAULT 'fixa',
    installments INTEGER DEFAULT 1,
    paid_installments INTEGER DEFAULT 0,
    customer_name TEXT,
    frequency TEXT DEFAULT 'Mensal',
    installment_value DECIMAL(12,2),
    installment_amounts JSONB,
    installment_dates JSONB,
    locador_id UUID,
    notes TEXT,
    category TEXT,
    warranty_product_id UUID,
    warranty_quantity INTEGER,
    partial_paid DECIMAL(12,2) DEFAULT 0,
    payment_history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payrolls table
CREATE TABLE IF NOT EXISTS public.payrolls (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    employee_id UUID NOT NULL,
    competence TEXT NOT NULL,
    gross_salary DECIMAL(12,2) DEFAULT 0,
    total_benefits DECIMAL(12,2) DEFAULT 0,
    total_deductions DECIMAL(12,2) DEFAULT 0,
    net_salary DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    due_date DATE,
    paid_date DATE,
    payment_method_id UUID,
    expense_id UUID,
    income_id UUID,
    closed BOOLEAN DEFAULT false,
    items JSONB DEFAULT '{"earnings": [], "deductions": []}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payroll_payments table
CREATE TABLE IF NOT EXISTS public.payroll_payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    payroll_id UUID NOT NULL REFERENCES public.payrolls(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method_id UUID,
    expense_id UUID,
    income_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create incomes table
CREATE TABLE IF NOT EXISTS public.incomes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    category TEXT,
    client_id UUID,
    source TEXT DEFAULT 'manual',
    payment_method_id UUID,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    actual_received_date DATE,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    recurrence TEXT DEFAULT 'once',
    parent_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create income_categories table
CREATE TABLE IF NOT EXISTS public.income_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payrolls TO authenticated;
GRANT ALL ON public.payrolls TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
GRANT ALL ON public.payroll_payments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incomes TO authenticated;
GRANT ALL ON public.incomes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_categories TO authenticated;
GRANT ALL ON public.income_categories TO service_role;

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own sales" ON public.sales FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own payrolls" ON public.payrolls FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own payroll payments" ON public.payroll_payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own incomes" ON public.incomes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own income categories" ON public.income_categories FOR ALL USING (auth.uid() = user_id);
