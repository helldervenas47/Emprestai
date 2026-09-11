-- Migration para garantir tabela e permissões iniciais de abas por papel (role_tab_permissions)
CREATE TABLE IF NOT EXISTS public.role_tab_permissions (
  role text NOT NULL,
  tab_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (role, tab_id)
);

ALTER TABLE public.role_tab_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_tab_permissions' AND policyname = 'role_tab_permissions_select'
  ) THEN
    CREATE POLICY role_tab_permissions_select ON public.role_tab_permissions FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_tab_permissions' AND policyname = 'role_tab_permissions_admin_all'
  ) THEN
    CREATE POLICY role_tab_permissions_admin_all ON public.role_tab_permissions FOR ALL
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- Insere as permissões padrão para cliente, gerente e visualizador se ainda não estiverem presentes
INSERT INTO public.role_tab_permissions (role, tab_id)
VALUES
  -- Cliente
  ('cliente', 'overview'),
  ('cliente', 'dashboard'),
  ('cliente', 'products'),
  ('cliente', 'vehicles'),
  ('cliente', 'calendar'),
  ('cliente', 'clients'),
  ('cliente', 'expenses'),
  ('cliente', 'boletos'),
  ('cliente', 'salary'),
  ('cliente', 'accountant'),
  ('cliente', 'overdue'),
  ('cliente', 'metas'),
  ('cliente', 'video_lessons'),
  ('cliente', 'settings'),
  ('cliente', 'help'),
  -- Gerente
  ('gerente', 'overview'),
  ('gerente', 'dashboard'),
  ('gerente', 'products'),
  ('gerente', 'vehicles'),
  ('gerente', 'calendar'),
  ('gerente', 'clients'),
  ('gerente', 'expenses'),
  ('gerente', 'boletos'),
  ('gerente', 'salary'),
  ('gerente', 'accountant'),
  ('gerente', 'overdue'),
  ('gerente', 'metas'),
  ('gerente', 'video_lessons'),
  ('gerente', 'settings'),
  ('gerente', 'help'),
  -- Visualizador
  ('visualizador', 'overview'),
  ('visualizador', 'dashboard'),
  ('visualizador', 'clients'),
  ('visualizador', 'calendar'),
  ('visualizador', 'overdue'),
  ('visualizador', 'video_lessons'),
  ('visualizador', 'help')
ON CONFLICT (role, tab_id) DO NOTHING;
