-- =====================================================================
-- Permissões granulares por papel (RBAC)
-- =====================================================================
-- Cria a matriz role × module × action editável pelo admin, com auditoria
-- e a função has_permission() usada pelas policies para autorizar ações.
--
-- Aplicar via edge function `migrate-sql` (admin) ou copiando o conteúdo
-- no console SQL do projeto.
-- =====================================================================

-- 1) Tabela de permissões por papel ------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,
  module      text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  UNIQUE (role, module)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions read for authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions read for authenticated"
  ON public.role_permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "role_permissions admin write" ON public.role_permissions;
CREATE POLICY "role_permissions admin write"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

-- 2) Auditoria ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,
  module      text NOT NULL,
  before_state jsonb,
  after_state  jsonb,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.role_permissions_audit TO authenticated;
GRANT ALL ON public.role_permissions_audit TO service_role;

ALTER TABLE public.role_permissions_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit admin read" ON public.role_permissions_audit;
CREATE POLICY "audit admin read"
  ON public.role_permissions_audit FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

CREATE OR REPLACE FUNCTION public.log_role_permissions_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := NULL;
  v_after  jsonb := NULL;
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    v_before := jsonb_build_object(
      'can_view', OLD.can_view, 'can_create', OLD.can_create,
      'can_edit', OLD.can_edit, 'can_delete', OLD.can_delete);
  END IF;
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') THEN
    v_after := jsonb_build_object(
      'can_view', NEW.can_view, 'can_create', NEW.can_create,
      'can_edit', NEW.can_edit, 'can_delete', NEW.can_delete);
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;

  INSERT INTO public.role_permissions_audit(role, module, before_state, after_state, changed_by)
  VALUES (
    COALESCE(NEW.role, OLD.role),
    COALESCE(NEW.module, OLD.module),
    v_before, v_after, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permissions_audit ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_audit
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_role_permissions_change();

-- 3) Função usada por policies / app -----------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role::text
     WHERE ur.user_id = _user
       AND rp.module = _module
       AND CASE _action
             WHEN 'view'   THEN rp.can_view
             WHEN 'create' THEN rp.can_create
             WHEN 'edit'   THEN rp.can_edit
             WHEN 'delete' THEN rp.can_delete
             ELSE false
           END
  )
  OR EXISTS (
    -- admin é sempre permitido, mesmo que linha não exista
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user AND role::text = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, service_role;

-- 4) Seed padrão -------------------------------------------------------
-- admin: tudo liberado; gerente: tudo exceto delete em users_admin;
-- operador: view/create/edit; visualizador: somente view.
DO $$
DECLARE
  v_modules text[] := ARRAY[
    'loans','clients','payments','expenses','incomes','payrolls',
    'reports','products','sales','credit_cards','users_admin','settings'
  ];
  m text;
BEGIN
  FOREACH m IN ARRAY v_modules LOOP
    INSERT INTO public.role_permissions(role, module, can_view, can_create, can_edit, can_delete)
    VALUES
      ('admin',        m, true,  true,  true,  true),
      ('gerente',      m, true,  true,  true,  m <> 'users_admin'),
      ('operador',     m, true,  m NOT IN ('users_admin','settings'), m NOT IN ('users_admin','settings'), false),
      ('visualizador', m, true,  false, false, false)
    ON CONFLICT (role, module) DO NOTHING;
  END LOOP;
END $$;
