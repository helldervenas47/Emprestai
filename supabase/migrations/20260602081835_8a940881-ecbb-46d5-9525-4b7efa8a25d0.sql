-- Update boleto_lookups table
ALTER TABLE public.boleto_lookups 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS digits TEXT,
ADD COLUMN IF NOT EXISTS bank_code TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS segment TEXT,
ADD COLUMN IF NOT EXISTS segment_label TEXT,
ADD COLUMN IF NOT EXISTS label TEXT,
ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS pix_brcode TEXT;

-- Update my_boletos table
ALTER TABLE public.my_boletos
ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES public.expenses(id),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Update my_boleto_payments table
ALTER TABLE public.my_boleto_payments
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Fix for useExpenses.ts missing columns
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS generate_income_on_pay BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS generated_income_id UUID,
ADD COLUMN IF NOT EXISTS payment_method_id UUID;

-- Correcting name column on credit_cards (required by build logs)
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Cartão';
