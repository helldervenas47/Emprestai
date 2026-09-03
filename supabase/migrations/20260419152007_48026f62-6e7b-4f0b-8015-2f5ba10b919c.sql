ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT 'EmprestAI';