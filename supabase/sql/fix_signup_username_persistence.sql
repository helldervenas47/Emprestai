-- ============================================================================
-- Script Direto para o Supabase SQL Editor:
-- Persistência de Username no Cadastro de Novos Usuários + Backfill
-- ============================================================================

-- 1. Atualiza a trigger handle_new_user para capturar o username da raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _username text := NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), '');
  _display_name text := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''), NEW.email);
  _cpf_cnpj text := NULLIF(TRIM(NEW.raw_user_meta_data->>'cpf_cnpj'), '');
  _phone text := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  INSERT INTO public.profiles (
    user_id,
    display_name,
    username,
    cpf_cnpj,
    phone,
    trial_started_at,
    trial_plan_name
  )
  VALUES (
    NEW.id,
    _display_name,
    _username,
    _cpf_cnpj,
    _phone,
    now(),
    'Teste Grátis'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    cpf_cnpj = COALESCE(public.profiles.cpf_cnpj, EXCLUDED.cpf_cnpj),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

  INSERT INTO public.subscriptions (
    user_id, paddle_subscription_id, paddle_customer_id,
    product_id, price_id, status, environment
  ) VALUES (
    NEW.id, 'free_' || NEW.id::text || '_live', 'free_customer_' || NEW.id::text,
    'free_plan', 'free', 'active', 'live'
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.seed_default_payment_methods(NEW.id);
  RETURN NEW;
END;
$function$;

-- 2. Backfill: Popula o username de usuários existentes cujo cadastro possuía username no auth.users
UPDATE public.profiles p
SET
  username = NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'username')), ''),
  phone = COALESCE(p.phone, NULLIF(TRIM(u.raw_user_meta_data->>'phone'), '')),
  cpf_cnpj = COALESCE(p.cpf_cnpj, NULLIF(TRIM(u.raw_user_meta_data->>'cpf_cnpj'), ''))
FROM auth.users u
WHERE p.user_id = u.id
  AND p.username IS NULL
  AND u.raw_user_meta_data->>'username' IS NOT NULL
  AND NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'username')), '') IS NOT NULL;

-- 3. Atualiza billing_admin_list
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
     COALESCE(p.username, NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'username')), '')) AS username,
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
     OR p.display_name ILIKE '%'||_search||'%'
     OR p.username ILIKE '%'||_search||'%'
     OR (u.raw_user_meta_data->>'username') ILIKE '%'||_search||'%'
     OR u.email ILIKE '%'||_search||'%'
   )
   AND (_status = '' OR coalesce(s.status, 'none') = _status)
 ), page AS (
   SELECT * FROM matching
   ORDER BY created_at DESC, user_id
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
