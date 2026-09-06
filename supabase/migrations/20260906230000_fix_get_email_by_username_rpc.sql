-- Correção definitiva da função RPC get_email_by_username
-- Busca o email em auth.users com base no username em profiles ou metadados

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

  -- Busca o email correspondente em auth.users
  SELECT u.email
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
      WHEN lower(trim(coalesce(p.display_name, ''))) = v_clean THEN 4
      ELSE 5
    END
  LIMIT 1;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN lower(trim(v_email));
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated, service_role;
