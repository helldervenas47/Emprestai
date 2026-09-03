-- =============================================================
-- Client Documents module
-- Rode este script no SQL Editor do seu projeto Supabase externo.
-- Cria a tabela `client_documents`, o bucket `client-documents` e
-- as policies de RLS (tabela + storage.objects).
-- =============================================================

-- 1) Bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Tabela de metadados
CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  category text NOT NULL,
  original_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_documents_client_id_idx
  ON public.client_documents(client_id);
CREATE INDEX IF NOT EXISTS client_documents_owner_id_idx
  ON public.client_documents(owner_id);

-- Grants para a Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;

-- 3) RLS na tabela
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_documents_select" ON public.client_documents;
CREATE POLICY "client_documents_select" ON public.client_documents
  FOR SELECT TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "client_documents_insert" ON public.client_documents;
CREATE POLICY "client_documents_insert" ON public.client_documents
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "client_documents_update" ON public.client_documents;
CREATE POLICY "client_documents_update" ON public.client_documents
  FOR UPDATE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "client_documents_delete" ON public.client_documents;
CREATE POLICY "client_documents_delete" ON public.client_documents
  FOR DELETE TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

-- 4) updated_at trigger
DROP TRIGGER IF EXISTS trg_client_documents_updated_at ON public.client_documents;
CREATE TRIGGER trg_client_documents_updated_at
BEFORE UPDATE ON public.client_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RLS no storage.objects — só permite acesso a objetos cujo primeiro
--    segmento do path bate com o data_owner do usuário autenticado.
--    Estrutura usada: clientes/{owner_id}/{client_id}/{arquivo}
DO $$
BEGIN
  DROP POLICY IF EXISTS "client_docs_obj_select" ON storage.objects;
  CREATE POLICY "client_docs_obj_select" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'client-documents'
      AND (storage.foldername(name))[1] = 'clientes'
      AND (storage.foldername(name))[2] = public.get_data_owner_id(auth.uid())::text);

  DROP POLICY IF EXISTS "client_docs_obj_insert" ON storage.objects;
  CREATE POLICY "client_docs_obj_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'client-documents'
      AND (storage.foldername(name))[1] = 'clientes'
      AND (storage.foldername(name))[2] = public.get_data_owner_id(auth.uid())::text);

  DROP POLICY IF EXISTS "client_docs_obj_update" ON storage.objects;
  CREATE POLICY "client_docs_obj_update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'client-documents'
      AND (storage.foldername(name))[1] = 'clientes'
      AND (storage.foldername(name))[2] = public.get_data_owner_id(auth.uid())::text);

  DROP POLICY IF EXISTS "client_docs_obj_delete" ON storage.objects;
  CREATE POLICY "client_docs_obj_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'client-documents'
      AND (storage.foldername(name))[1] = 'clientes'
      AND (storage.foldername(name))[2] = public.get_data_owner_id(auth.uid())::text);
END $$;
