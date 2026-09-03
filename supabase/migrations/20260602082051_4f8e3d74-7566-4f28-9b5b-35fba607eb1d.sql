-- Final schema alignment for my_boletos
ALTER TABLE public.my_boletos 
ADD COLUMN IF NOT EXISTS beneficiary TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS bank_code TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS segment TEXT,
ADD COLUMN IF NOT EXISTS segment_label TEXT,
ADD COLUMN IF NOT EXISTS kind TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS attachment_path TEXT,
ADD COLUMN IF NOT EXISTS pix_brcode TEXT,
ADD COLUMN IF NOT EXISTS income_id UUID; -- REFERENCES incomes(id) if exists, else just UUID

-- Ensure owner_id and notes on my_boleto_payments
ALTER TABLE public.my_boleto_payments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE public.my_boleto_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.my_boleto_payments ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Final column unify for monthly_opening_balances (RejectExcessProperties fix)
ALTER TABLE public.monthly_opening_balances ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Final check on expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS generate_income_on_pay BOOLEAN DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS generated_income_id UUID;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_method_id UUID;

-- RLS for everything added
CREATE POLICY "RLS my_boletos final" ON public.my_boletos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "RLS my_boleto_payments final" ON public.my_boleto_payments FOR ALL USING (auth.uid() = user_id);
