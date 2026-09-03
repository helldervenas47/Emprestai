-- Update backup_history table
ALTER TABLE public.backup_history 
ADD COLUMN IF NOT EXISTS filename TEXT,
ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS error TEXT,
ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES auth.users(id);

-- Update expenses table for installment tracking
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS parent_expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expenses_parent_id ON public.expenses(parent_expense_id);

-- Update profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_balance table
CREATE TABLE IF NOT EXISTS public.vehicle_balance (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_balance TO authenticated;
GRANT ALL ON public.vehicle_balance TO service_role;

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_balance ENABLE ROW LEVEL SECURITY;

-- Policies for products
CREATE POLICY "Users can manage their own products"
ON public.products
FOR ALL
USING (auth.uid() = user_id);

-- Policies for vehicle_balance
CREATE POLICY "Users can manage their own vehicle balance"
ON public.vehicle_balance
FOR ALL
USING (auth.uid() = user_id);

-- Ensure user_owner exists and has correct columns (requested by build logs)
CREATE TABLE IF NOT EXISTS public.user_owner (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_owner TO authenticated;
GRANT ALL ON public.user_owner TO service_role;
ALTER TABLE public.user_owner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ownership link"
ON public.user_owner FOR SELECT USING (auth.uid() = user_id OR auth.uid() = owner_id);
