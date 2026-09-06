-- Manual billing actions are account-level. Keep the existing implementation
-- as the owner-only core and expose a stable RPC that accepts any account user.
DO $$
BEGIN
  IF to_regprocedure('public.billing_admin_action_owner(uuid,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.billing_admin_action(uuid,text,jsonb)
      RENAME TO billing_admin_action_owner;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.billing_admin_action(_admin uuid,_env text,_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  requested_uid uuid:=(_body->>'target_user_id')::uuid;
  owner_uid uuid;
  result jsonb;
BEGIN
  IF requested_uid IS NULL THEN RAISE EXCEPTION 'target_user_id required'; END IF;
  owner_uid:=coalesce(public.get_data_owner_id(requested_uid),requested_uid);
  result:=public.billing_admin_action_owner(
    _admin,
    _env,
    jsonb_set(_body,'{target_user_id}',to_jsonb(owner_uid::text),true)
  );
  RETURN result||jsonb_build_object(
    'requested_user_id',requested_uid,
    'account_owner_id',owner_uid
  );
END $$;

-- Subscription management is account-level, so each account appears once.
CREATE OR REPLACE FUNCTION public.billing_admin_list(_admin uuid,_env text,_search text DEFAULT '',_status text DEFAULT '',_limit integer DEFAULT 100,_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(_admin,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH matching AS (
   SELECT p.*,u.email,to_jsonb(s) AS subscription FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
   LEFT JOIN public.subscriptions s ON s.user_id=p.user_id AND s.environment=_env
   WHERE public.get_data_owner_id(p.user_id)=p.user_id
   AND (_search='' OR p.display_name ILIKE '%'||_search||'%' OR p.username ILIKE '%'||_search||'%' OR u.email ILIKE '%'||_search||'%')
   AND (_status='' OR coalesce(s.status,'none')=_status)
 ), page AS (SELECT * FROM matching ORDER BY created_at DESC,user_id LIMIT greatest(1,least(_limit,200)) OFFSET greatest(0,_offset))
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
 'total',(SELECT count(*) FROM matching),'plans',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.plans p WHERE active=true),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.billing_admin_action_owner(uuid,text,jsonb),
 public.billing_admin_action(uuid,text,jsonb),public.billing_admin_list(uuid,text,text,text,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_action_owner(uuid,text,jsonb),
 public.billing_admin_action(uuid,text,jsonb),public.billing_admin_list(uuid,text,text,text,integer,integer)
 TO service_role;
