-- Adds the 'cliente' value to the app_role enum on the EXTERNAL Supabase project.
-- Run once against the external database (the one userClient points to).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente';
