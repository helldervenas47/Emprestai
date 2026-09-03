-- Hardening: pin search_path on list_my_sessions()
--
-- Findings: security scan flagged this SECURITY DEFINER function as missing
-- an explicit `SET search_path`, which is a standard hardening measure to
-- prevent schema-shadowing attacks. The other three DEFINER functions in the
-- project (handle_new_user, update_updated_at_column, get_data_owner_id)
-- already have it — this brings list_my_sessions in line.
--
-- Behavior is unchanged; only the security qualifier is added.

DROP FUNCTION IF EXISTS public.list_my_sessions();

CREATE OR REPLACE FUNCTION public.list_my_sessions()
 RETURNS TABLE(
   id uuid,
   user_id uuid,
   ip_address text,
   user_agent text,
   last_active_at timestamp with time zone,
   is_current_session boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    gen_random_uuid()          AS id,
    auth.uid()                 AS user_id,
    '127.0.0.1'::text          AS ip_address,
    'User Agent'::text         AS user_agent,
    now()                      AS last_active_at,
    true                       AS is_current_session;
END;
$function$;
