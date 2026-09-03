-- Create boleto_lookups table
CREATE TABLE IF NOT EXISTS public.boleto_lookups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    barcode TEXT,
    digitable_line TEXT,
    beneficiary TEXT,
    payer TEXT,
    type TEXT,
    due_date DATE,
    value DECIMAL(12,2),
    status TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chart_overrides table
CREATE TABLE IF NOT EXISTS public.chart_overrides (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    month_label TEXT NOT NULL,
    emprestado DECIMAL(12,2) DEFAULT 0,
    recebido DECIMAL(12,2) DEFAULT 0,
    juros DECIMAL(12,2) DEFAULT 0,
    juros_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, month_label)
);

-- Function to list user sessions (mocking/implementing as needed by frontend)
CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    ip_address TEXT,
    user_agent TEXT,
    last_active_at TIMESTAMP WITH TIME ZONE,
    is_current_session BOOLEAN
) AS $$
BEGIN
    -- This is often handled by Supabase Auth internally, but we provide a 
    -- placeholder or shim if the app expects it in public schema.
    RETURN QUERY 
    SELECT 
        gen_random_uuid() as id,
        auth.uid() as user_id,
        '127.0.0.1'::text as ip_address,
        'User Agent'::text as user_agent,
        now() as last_active_at,
        true as is_current_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boleto_lookups TO authenticated;
GRANT ALL ON public.boleto_lookups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_overrides TO authenticated;
GRANT ALL ON public.chart_overrides TO service_role;

-- Enable RLS
ALTER TABLE public.boleto_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_overrides ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own boleto lookups" ON public.boleto_lookups FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own chart overrides" ON public.chart_overrides FOR ALL USING (auth.uid() = user_id);
