-- Remove the overly permissive policy that exposes owner_id to anon users
DROP POLICY IF EXISTS "Anyone can validate active invite codes" ON public.invite_codes;

-- Create a security-definer function for safe invite validation
CREATE OR REPLACE FUNCTION public.validate_invite_code(_code text)
RETURNS TABLE(valid boolean, owner_id uuid, require_approval boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
  _require_approval boolean;
BEGIN
  SELECT ic.owner_id, ic.active, ic.expires_at, ic.uses_count, ic.max_uses
  INTO _invite
  FROM public.invite_codes ic
  WHERE ic.code = _code;

  IF _invite IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::boolean, 'Código não encontrado'::text;
    RETURN;
  END IF;

  IF NOT _invite.active THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::boolean, 'Código desativado'::text;
    RETURN;
  END IF;

  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::boolean, 'Código expirado'::text;
    RETURN;
  END IF;

  IF _invite.max_uses IS NOT NULL AND _invite.uses_count >= _invite.max_uses THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::boolean, 'Código esgotado'::text;
    RETURN;
  END IF;

  SELECT s.require_approval INTO _require_approval
  FROM public.account_settings s
  WHERE s.owner_id = _invite.owner_id;

  RETURN QUERY SELECT true, _invite.owner_id, COALESCE(_require_approval, false), NULL::text;
END;
$$;

-- Allow anon and authenticated to call the safe validator
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;