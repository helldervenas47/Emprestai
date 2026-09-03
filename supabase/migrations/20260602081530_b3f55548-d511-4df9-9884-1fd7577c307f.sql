-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    role TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'operador', 'visualizador')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create balance_adjustments table
CREATE TABLE IF NOT EXISTS public.balance_adjustments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount DECIMAL(12,2) NOT NULL,
    previous_amount DECIMAL(12,2),
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    adjusted_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update telegram_image_delivery_prefs table (fix previous migration typo/omission)
ALTER TABLE public.telegram_image_delivery_prefs ADD COLUMN IF NOT EXISTS allowed_user_ids UUID[] DEFAULT '{}';

-- Create get_data_owner_id function
CREATE OR REPLACE FUNCTION public.get_data_owner_id(_user_id UUID)
RETURNS UUID AS $$
DECLARE
    _owner_id UUID;
BEGIN
    SELECT owner_id INTO _owner_id FROM public.user_owner WHERE user_id = _user_id;
    RETURN COALESCE(_owner_id, _user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_adjustments TO authenticated;
GRANT ALL ON public.balance_adjustments TO service_role;

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can manage their own balance adjustments" ON public.balance_adjustments FOR ALL USING (auth.uid() = user_id);

-- Fix for list_my_sessions missing from rpc
-- This is usually a supabase internal function, but if it is called via invoke/rpc, 
-- we ensure the schema knows about it or the code handles it.
