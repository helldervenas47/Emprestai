-- Make can_write_data() explicitly DENY visualizador role.
-- Previous logic returned TRUE for users without an entry in user_owner OR with admin/operador role,
-- but a sub-user explicitly assigned the 'visualizador' role could still slip through write paths
-- when their owner relation logic was bypassed. Add an explicit deny for visualizador.
CREATE OR REPLACE FUNCTION public.can_write_data(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Explicit deny: anyone with the visualizador role cannot write
    NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'visualizador'
    )
    AND (
      -- User is the data owner (no entry in user_owner)
      NOT EXISTS (SELECT 1 FROM public.user_owner WHERE user_id = _user_id)
      OR
      -- User has admin or operador role
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role IN ('admin', 'operador')
      )
    )
$function$;