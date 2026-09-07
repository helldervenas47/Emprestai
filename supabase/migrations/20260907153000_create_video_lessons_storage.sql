-- Migration: Criação do bucket de armazenamento 'video-lessons' no Supabase Storage

-- 1. Inserir bucket público se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-lessons',
  'video-lessons',
  true,
  524288000, -- 500 MB limite por arquivo
  ARRAY[
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

-- 2. Políticas de acesso ao bucket 'video-lessons':

-- Leitura pública / autenticada
DROP POLICY IF EXISTS "video_lessons_storage_read" ON storage.objects;
CREATE POLICY "video_lessons_storage_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'video-lessons');

-- Upload / Inserção: apenas administradores
DROP POLICY IF EXISTS "video_lessons_storage_insert" ON storage.objects;
CREATE POLICY "video_lessons_storage_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'video-lessons'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Atualização: apenas administradores
DROP POLICY IF EXISTS "video_lessons_storage_update" ON storage.objects;
CREATE POLICY "video_lessons_storage_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'video-lessons'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Exclusão: apenas administradores
DROP POLICY IF EXISTS "video_lessons_storage_delete" ON storage.objects;
CREATE POLICY "video_lessons_storage_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'video-lessons'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );
