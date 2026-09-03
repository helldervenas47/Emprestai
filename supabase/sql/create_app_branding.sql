-- ─────────────────────────────────────────────────────────────
-- Fix: PGRST205 "Could not find the table 'public.app_branding'"
--
-- The app queries public.app_branding via useAppBranding (src/hooks/useAppBranding.ts)
-- and BrandTitleSync/BrandFaviconSync mount it on every route. The table
-- was missing on this project, causing continuous 404s in the network log
-- (harmless — falls back to defaults — but noisy and blocks logo/name
-- customization). This migration creates the singleton table + storage
-- bucket the code already assumes.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_branding (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton    boolean     NOT NULL DEFAULT true UNIQUE,   -- upsert onConflict: "singleton"
  logo_url     text,
  brand_name   text        NOT NULL DEFAULT 'EmprestAI',
  sizes        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT app_branding_singleton_true CHECK (singleton = true)
);

-- Data-API grants (Supabase requires explicit grants for PostgREST)
GRANT SELECT ON public.app_branding TO anon;                    -- branding is app-wide public metadata (logo/name shown on /auth)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_branding TO authenticated;
GRANT ALL ON public.app_branding TO service_role;

-- Auto-refresh updated_at on modifications
DROP TRIGGER IF EXISTS trg_app_branding_updated_at ON public.app_branding;
CREATE TRIGGER trg_app_branding_updated_at
  BEFORE UPDATE ON public.app_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row-Level Security
ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read the current branding — required so the
-- /auth page renders the correct logo/name before sign-in.
DROP POLICY IF EXISTS "Branding is publicly readable" ON public.app_branding;
CREATE POLICY "Branding is publicly readable"
  ON public.app_branding
  FOR SELECT
  USING (true);

-- Only admins may mutate branding. Uses the existing has_role() helper.
-- If your project uses a different admin gate, adjust the USING/WITH CHECK.
DROP POLICY IF EXISTS "Admins can insert branding" ON public.app_branding;
CREATE POLICY "Admins can insert branding"
  ON public.app_branding
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update branding" ON public.app_branding;
CREATE POLICY "Admins can update branding"
  ON public.app_branding
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the singleton row so the app always has something to read
INSERT INTO public.app_branding (singleton, brand_name, sizes)
VALUES (true, 'EmprestAI', '{}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

-- Storage bucket used by useAppBranding.uploadLogo() (bucket: "branding")
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: public read, admin-only write
DROP POLICY IF EXISTS "Branding assets are publicly readable" ON storage.objects;
CREATE POLICY "Branding assets are publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins can upload branding assets" ON storage.objects;
CREATE POLICY "Admins can upload branding assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update branding assets" ON storage.objects;
CREATE POLICY "Admins can update branding assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete branding assets" ON storage.objects;
CREATE POLICY "Admins can delete branding assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
