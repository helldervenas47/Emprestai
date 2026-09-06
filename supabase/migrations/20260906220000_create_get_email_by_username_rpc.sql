-- Função RPC SECURITY DEFINER para resolver nome de usuário em email para login
-- Permite que usuários não autenticados resolvam seu username para o email de autenticação

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_clean text;
BEGIN
  v_clean := lower(trim(coalesce(p_username, '')));
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Busca por profiles.username ou profiles.display_name
  SELECT p.user_id, coalesce(p.email, u.email)
  INTO v_user_id, v_email
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE lower(trim(coalesce(p.username, ''))) = v_clean
     OR lower(trim(coalesce(p.display_name, ''))) = v_clean
  LIMIT 1;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN lower(trim(v_email));
  END IF;

  -- 2. Busca por raw_user_meta_data->>'username' em auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE lower(trim(coalesce(raw_user_meta_data->>'username', ''))) = v_clean
     OR lower(trim(coalesce(raw_user_meta_data->>'display_name', ''))) = v_clean
  LIMIT 1;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN lower(trim(v_email));
  END IF;

  RETURN NULL;
END;
$$;

-- Concede permissão para usuários anônimos e autenticados
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated, service_role;
