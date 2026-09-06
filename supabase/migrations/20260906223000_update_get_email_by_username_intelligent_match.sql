-- Atualização da função RPC get_email_by_username para busca inteligente
-- Suporta: profiles.username, display_name, prefixo do email antes do @, metadados

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_clean text;
BEGIN
  v_clean := lower(trim(coalesce(p_username, '')));
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  -- Busca inteligente em auth.users e profiles
  SELECT coalesce(u.email, p.email)
  INTO v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(trim(coalesce(p.username, ''))) = v_clean
     OR lower(trim(coalesce(p.display_name, ''))) = v_clean
     OR lower(regexp_replace(coalesce(p.display_name, ''), '\s+', '', 'g')) = v_clean
     OR lower(trim(coalesce(u.raw_user_meta_data->>'username', ''))) = v_clean
     OR lower(trim(coalesce(u.raw_user_meta_data->>'display_name', ''))) = v_clean
     OR lower(split_part(u.email, '@', 1)) = v_clean
     OR lower(trim(u.email)) = v_clean
  ORDER BY 
    CASE 
      WHEN lower(trim(coalesce(p.username, ''))) = v_clean THEN 1
      WHEN lower(trim(u.email)) = v_clean THEN 2
      WHEN lower(split_part(u.email, '@', 1)) = v_clean THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN lower(trim(v_email));
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated, service_role;
