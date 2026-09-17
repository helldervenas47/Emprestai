-- ============================================================================
-- SQL Script: Ordenação alfabética por Nome e Backfill de Usernames em Profiles
-- ============================================================================

-- 1. Preenche username em profiles para qualquer usuário existente onde ainda estiver nulo
UPDATE public.profiles p
SET
  username = COALESCE(
    NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'username')), ''),
    NULLIF(LOWER(TRIM(split_part(u.email, '@', 1))), ''),
    NULLIF(LOWER(REGEXP_REPLACE(p.display_name, '\s+', '', 'g')), '')
  )
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.username IS NULL OR TRIM(p.username) = '');

CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Atualiza a RPC billing_admin_list para retornar sempre ordenado por nome em ordem alfabética (A-Z) e com busca sem acento
CREATE OR REPLACE FUNCTION public.billing_admin_list(
  _admin uuid,
  _env text,
  _search text DEFAULT '',
  _status text DEFAULT '',
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(_admin,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH matching AS (
   SELECT
     p.user_id,
     COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', u.email) AS display_name,
     COALESCE(
       p.username,
       NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'username')), ''),
       NULLIF(LOWER(TRIM(split_part(u.email, '@', 1))), '')
     ) AS username,
     p.cpf_cnpj,
     p.phone,
     p.created_at,
     p.trial_started_at,
     p.trial_plan_name,
     p.trial_days_override,
     p.is_blocked,
     p.blocked_reason,
     p.blocked_at,
     p.blocked_by,
     p.subscription_bump_at,
     p.updated_at,
     u.email,
     to_jsonb(s) AS subscription
   FROM public.profiles p
   JOIN auth.users u ON u.id = p.user_id
   LEFT JOIN public.subscriptions s ON s.user_id = p.user_id AND s.environment = _env
   WHERE public.get_data_owner_id(p.user_id) = p.user_id
   AND (
     _search = ''
     OR unaccent(COALESCE(p.display_name, '')) ILIKE '%'||unaccent(_search)||'%'
     OR unaccent(COALESCE(p.username, '')) ILIKE '%'||unaccent(_search)||'%'
     OR unaccent(COALESCE(u.raw_user_meta_data->>'username', '')) ILIKE '%'||unaccent(_search)||'%'
     OR unaccent(COALESCE(u.email, '')) ILIKE '%'||unaccent(_search)||'%'
   )
   AND (_status = '' OR coalesce(s.status, 'none') = _status)
 ), page AS (
   SELECT * FROM matching
   ORDER BY LOWER(COALESCE(display_name, username, email, '')) ASC, user_id
   LIMIT greatest(1, least(_limit, 200))
   OFFSET greatest(0, _offset)
 )
 SELECT jsonb_build_object(
   'rows', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
   'total', (SELECT count(*) FROM matching),
   'plans', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.plans p WHERE active = true), '[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.billing_admin_list(uuid,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_list(uuid,text,text,text,integer,integer) TO service_role;
