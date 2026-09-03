-- 1) Tabela de identidade visual global (singleton)
CREATE TABLE public.app_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  logo_url text,
  sizes jsonb NOT NULL DEFAULT '{
    "header":  {"desktop": 40,  "tablet": 36,  "mobile": 32},
    "auth":    {"desktop": 96,  "tablet": 80,  "mobile": 64},
    "favicon": {"desktop": 64,  "tablet": 64,  "mobile": 64},
    "report":  {"desktop": 80,  "tablet": 72,  "mobile": 64}
  }'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem LER (precisam exibir a logo)
CREATE POLICY "Anyone authenticated can view branding"
  ON public.app_branding FOR SELECT
  TO authenticated, anon
  USING (true);

-- Apenas admins podem inserir/alterar/excluir
CREATE POLICY "Admins can insert branding"
  ON public.app_branding FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update branding"
  ON public.app_branding FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete branding"
  ON public.app_branding FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_app_branding_updated_at
  BEFORE UPDATE ON public.app_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Linha singleton inicial
INSERT INTO public.app_branding (singleton) VALUES (true);

-- 2) Bucket público para a logo
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: leitura pública, escrita só admin
CREATE POLICY "Public can read branding files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

CREATE POLICY "Admins can upload branding files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update branding files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete branding files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'::app_role));