-- Update expenses table
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'business';

-- Create credit_limit_history table
CREATE TABLE IF NOT EXISTS public.credit_limit_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    client_id UUID NOT NULL REFERENCES public.clients(id),
    old_limit DECIMAL(12,2),
    new_limit DECIMAL(12,2),
    change_type TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    product_id UUID NOT NULL REFERENCES public.products(id),
    product_name TEXT,
    movement_type TEXT,
    quantity INTEGER NOT NULL,
    notes TEXT,
    sale_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create telegram_image_delivery_prefs table
CREATE TABLE IF NOT EXISTS public.telegram_image_delivery_prefs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    reports JSONB DEFAULT '[]',
    include_text BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webhook_settings table
CREATE TABLE IF NOT EXISTS public.webhook_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    webhook_url TEXT,
    enabled BOOLEAN DEFAULT false,
    send_time TEXT DEFAULT '09:00',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create personal_categories table (referenced in build errors as causing type mismatches)
CREATE TABLE IF NOT EXISTS public.personal_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_limit_history TO authenticated;
GRANT ALL ON public.credit_limit_history TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_image_delivery_prefs TO authenticated;
GRANT ALL ON public.telegram_image_delivery_prefs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_settings TO authenticated;
GRANT ALL ON public.webhook_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_categories TO authenticated;
GRANT ALL ON public.personal_categories TO service_role;

-- Enable RLS
ALTER TABLE public.credit_limit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_image_delivery_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own credit limit history" ON public.credit_limit_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own stock movements" ON public.stock_movements FOR ALL USING (auth.uid() = user_id OR auth.uid() = owner_id);
CREATE POLICY "Users can manage their own telegram delivery prefs" ON public.telegram_image_delivery_prefs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own webhook settings" ON public.webhook_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own personal categories" ON public.personal_categories FOR ALL USING (auth.uid() = user_id);
