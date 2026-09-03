-- Create vehicle_registry table
CREATE TABLE IF NOT EXISTS public.vehicle_registry (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    marca_modelo TEXT NOT NULL,
    ano TEXT,
    cor TEXT,
    placa TEXT,
    renavam TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create whatsapp_assistant_authorized table
CREATE TABLE IF NOT EXISTS public.whatsapp_assistant_authorized (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    phone TEXT NOT NULL,
    label TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(owner_id, phone)
);

-- Consistency for locador_info (already created, ensuring user_id)
ALTER TABLE public.locador_info ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Consistency for payrolls (fix for usePayrolls.ts)
-- Ensure competence and other numeric fields are correct
-- No changes needed based on previous payrolls creation.

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_registry TO authenticated;
GRANT ALL ON public.vehicle_registry TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_assistant_authorized TO authenticated;
GRANT ALL ON public.whatsapp_assistant_authorized TO service_role;

-- Enable RLS
ALTER TABLE public.vehicle_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_assistant_authorized ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own vehicle registry" ON public.vehicle_registry FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own authorized whatsapp numbers" ON public.whatsapp_assistant_authorized FOR ALL USING (auth.uid() = owner_id);
