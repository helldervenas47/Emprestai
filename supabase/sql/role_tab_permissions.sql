-- Create role_tab_permissions table to control which app tabs each role can see.
-- Apply via: select supabase_functions.invoke or run manually.
CREATE TABLE IF NOT EXISTS public.role_tab_permissions (
  role text NOT NULL,
  tab_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, tab_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_tab_permissions TO authenticated;
GRANT ALL ON public.role_tab_permissions TO service_role;

ALTER TABLE public.role_tab_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rtp_sel ON public.role_tab_permissions;
CREATE POLICY rtp_sel ON public.role_tab_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rtp_ins ON public.role_tab_permissions;
CREATE POLICY rtp_ins ON public.role_tab_permissions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS rtp_upd ON public.role_tab_permissions;
CREATE POLICY rtp_upd ON public.role_tab_permissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS rtp_del ON public.role_tab_permissions;
CREATE POLICY rtp_del ON public.role_tab_permissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.role_tab_permissions (role, tab_id) VALUES
  ('cliente','overview'),('cliente','dashboard'),('cliente','products'),('cliente','vehicles'),
  ('cliente','calendar'),('cliente','clients'),('cliente','expenses'),('cliente','boletos'),
  ('cliente','salary'),('cliente','accountant'),('cliente','overdue'),('cliente','settings'),
  ('gerente','overview'),('gerente','dashboard'),('gerente','products'),('gerente','vehicles'),
  ('gerente','calendar'),('gerente','clients'),('gerente','expenses'),('gerente','boletos'),
  ('gerente','salary'),('gerente','accountant'),('gerente','overdue'),('gerente','settings'),
  ('visualizador','overview'),('visualizador','dashboard'),('visualizador','clients'),
  ('visualizador','calendar'),('visualizador','overdue')
ON CONFLICT (role, tab_id) DO NOTHING;
