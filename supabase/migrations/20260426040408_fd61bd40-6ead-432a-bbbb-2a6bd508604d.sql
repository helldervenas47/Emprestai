-- Tabela para rastrear sessões de "visualizar como" do admin
CREATE TABLE public.admin_viewing_sessions (
  admin_id uuid PRIMARY KEY,
  viewing_user_id uuid NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_viewing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own viewing sessions select"
  ON public.admin_viewing_sessions FOR SELECT
  TO authenticated
  USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage own viewing sessions insert"
  ON public.admin_viewing_sessions FOR INSERT
  TO authenticated
  WITH CHECK (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage own viewing sessions update"
  ON public.admin_viewing_sessions FOR UPDATE
  TO authenticated
  USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage own viewing sessions delete"
  ON public.admin_viewing_sessions FOR DELETE
  TO authenticated
  USING (admin_id = auth.uid());

-- Atualizar get_data_owner_id para considerar sessão de visualização
CREATE OR REPLACE FUNCTION public.get_data_owner_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- Admin em modo "visualizar como" → retorna o usuário alvo
    (SELECT viewing_user_id FROM public.admin_viewing_sessions
       WHERE admin_id = _user_id
       AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    ),
    (SELECT owner_id FROM public.user_owner WHERE user_id = _user_id),
    _user_id
  )
$function$;

-- Atualizar can_write_data para bloquear escrita durante visualização
CREATE OR REPLACE FUNCTION public.can_write_data(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Bloqueio: admin em sessão de visualização não pode escrever
    NOT EXISTS (
      SELECT 1 FROM public.admin_viewing_sessions WHERE admin_id = _user_id
    )
    AND
    -- Explicit deny: anyone with the visualizador role cannot write
    NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'visualizador'
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_owner WHERE user_id = _user_id)
      OR
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role IN ('admin', 'operador')
      )
    )
$function$;