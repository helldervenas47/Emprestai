-- Validação posterior à migration de billing. Somente leitura e sem PII.
WITH target_accounts AS (
  SELECT p.user_id,substr(md5(p.user_id::text),1,12) AS account_key
    FROM public.profiles p
   WHERE substr(md5(p.user_id::text),1,12) IN ('37be4a4e3c1f','6fed5893a3e9','ea1233061fce')
), target_states AS (
  SELECT t.account_key,
         public.billing_access_state(t.user_id) AS access_state,
         coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'environment',s.environment,'status',s.status,'product_id',s.product_id,
           'period_end',s.current_period_end,'manual_override',s.manual_override,
           'manual_note',s.manual_note
         )) ORDER BY s.environment) FROM public.subscriptions s WHERE s.user_id=t.user_id),'[]'::jsonb) AS subscriptions
    FROM target_accounts t
), required_objects AS (
  SELECT object_name,to_regclass('public.'||object_name) IS NOT NULL AS present
    FROM unnest(ARRAY[
      'billing_runtime_config','billing_accounts','billing_customers',
      'billing_orders','billing_contracts','asaas_webhook_events',
      'subscription_audit_log'
    ]) AS object_name
), required_functions AS (
  SELECT signature,to_regprocedure('public.'||signature) IS NOT NULL AS present
    FROM unnest(ARRAY[
      'billing_access_state(uuid)','billing_prepare_order(uuid,text,uuid,uuid,text,bigint,text)',
      'billing_apply_payment(text,text,text,jsonb)','billing_admin_action(uuid,text,jsonb)',
      'billing_admin_list(uuid,text,text,text,integer,integer)','my_access_state()',
      'is_access_blocked(uuid)','has_active_subscription(uuid)',
      'has_active_subscription(uuid,text)'
    ]) AS signature
), webhook_columns AS (
  SELECT column_name,data_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='asaas_webhook_events'
     AND column_name IN ('event_id','environment','status','error','error_message','processed_at')
), policy_summary AS (
  SELECT count(*) AS restrictive_billing_policies,
         count(DISTINCT tablename) AS protected_tables
    FROM pg_policies
   WHERE schemaname='public' AND policyname LIKE 'billing_write_%'
), remaining_risks AS (
  SELECT
    count(*) FILTER (
      WHERE s.environment='live' AND s.current_period_end IS NULL
        AND s.status IN ('active','paid','trialing','canceled')
        AND NOT public.has_role(s.user_id,'admin')
    ) AS non_admin_live_without_expiration,
    count(*) FILTER (
      WHERE p.manual_override IS NOT NULL
        AND p.manual_override NOT IN ('BANNED','FREE_PASS')
    ) AS unsupported_profile_overrides
    FROM public.subscriptions s
    JOIN public.profiles p ON p.user_id=s.user_id
)
SELECT jsonb_build_object(
  'runtime_environment',(SELECT environment FROM public.billing_runtime_config WHERE singleton),
  'objects',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY object_name) FROM required_objects o),'[]'::jsonb),
  'functions',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM required_functions f),'[]'::jsonb),
  'webhook_columns',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY column_name) FROM webhook_columns c),'[]'::jsonb),
  'policies',(SELECT to_jsonb(p) FROM policy_summary p),
  'remaining_risks',(SELECT to_jsonb(r) FROM remaining_risks r),
  'transition_accounts',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY account_key) FROM target_states t),'[]'::jsonb)
) AS validacao_billing;
