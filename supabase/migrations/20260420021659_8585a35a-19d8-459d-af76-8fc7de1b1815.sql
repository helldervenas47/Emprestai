
CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  not_after timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip) AS ip, s.not_after
  FROM auth.sessions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.updated_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.revoke_my_session(_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _owner uuid;
BEGIN
  SELECT user_id INTO _owner FROM auth.sessions WHERE id = _session_id;
  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RETURN false;
  END IF;
  DELETE FROM auth.sessions WHERE id = _session_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_sessions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_my_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_my_session(uuid) TO authenticated;
