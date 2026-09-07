-- Migration: Criação da tabela video_lessons com suporte a RLS por perfil de usuário

CREATE TABLE IF NOT EXISTS public.video_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  category TEXT DEFAULT 'Geral',
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.video_lessons ENABLE ROW LEVEL SECURITY;

-- Índices para performance de consulta e ordenação
CREATE INDEX IF NOT EXISTS idx_video_lessons_status_order ON public.video_lessons(status, display_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_lessons_category ON public.video_lessons(category);

-- 1. Política de SELECT:
-- Usuários comuns autenticados podem ver apenas vídeos publicados (status = 'published').
-- Administradores (has_role(auth.uid(), 'admin')) podem ver todos (publicados e rascunhos).
DROP POLICY IF EXISTS "video_lessons_select_policy" ON public.video_lessons;
CREATE POLICY "video_lessons_select_policy" ON public.video_lessons
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

-- 2. Política de INSERT: apenas administradores
DROP POLICY IF EXISTS "video_lessons_insert_policy" ON public.video_lessons;
CREATE POLICY "video_lessons_insert_policy" ON public.video_lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- 3. Política de UPDATE: apenas administradores
DROP POLICY IF EXISTS "video_lessons_update_policy" ON public.video_lessons;
CREATE POLICY "video_lessons_update_policy" ON public.video_lessons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- 4. Política de DELETE: apenas administradores
DROP POLICY IF EXISTS "video_lessons_delete_policy" ON public.video_lessons;
CREATE POLICY "video_lessons_delete_policy" ON public.video_lessons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );
