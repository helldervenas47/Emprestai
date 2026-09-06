-- Diagnostico complementar, somente leitura.
-- Retorna uma unica celula JSON e anonimiza os usuarios com um hash curto.
WITH relevant_users AS (
  SELECT p.user_id
    FROM public.profiles p
   WHERE nullif(to_jsonb(p)->>'manual_override', '') IS NOT NULL
      OR nullif(to_jsonb(p)->>'current_period_end', '')::timestamptz > now()
  UNION
  SELECT s.user_id
    FROM public.subscriptions s
   WHERE coalesce((to_jsonb(s)->>'manual_override')::boolean, false)
      OR (
        s.environment = 'live'
        AND s.status IN ('active', 'paid', 'trialing', 'canceled')
        AND s.current_period_end IS NULL
      )
), access_cases AS (
  SELECT
    substr(md5(p.user_id::text), 1, 12) AS account_key,
    jsonb_strip_nulls(jsonb_build_object(
      'financial_status', to_jsonb(p)->>'financial_status',
      'profile_period_end', to_jsonb(p)->>'current_period_end',
      'profile_plan_id', to_jsonb(p)->>'current_plan_id',
      'legacy_override', to_jsonb(p)->>'manual_override',
      'is_blocked', to_jsonb(p)->>'is_blocked',
      'trial_started_at', to_jsonb(p)->>'trial_started_at',
      'trial_used_at', to_jsonb(p)->>'trial_used_at',
      'trial_plan_name', to_jsonb(p)->>'trial_plan_name',
      'trial_days_override', to_jsonb(p)->>'trial_days_override'
    )) AS profile,
    coalesce((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'environment', s.environment,
        'status', s.status,
        'plan_id', to_jsonb(s)->>'plan_id',
        'product_id', s.product_id,
        'price_id', s.price_id,
        'period_start', s.current_period_start,
        'period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'manual_override', to_jsonb(s)->>'manual_override',
        'manual_note', to_jsonb(s)->>'manual_note',
        'has_asaas_payment', nullif(to_jsonb(s)->>'asaas_payment_id', '') IS NOT NULL,
        'has_asaas_subscription', nullif(to_jsonb(s)->>'asaas_subscription_id', '') IS NOT NULL
      )) ORDER BY s.environment, s.created_at)
        FROM public.subscriptions s
       WHERE s.user_id = p.user_id
    ), '[]'::jsonb) AS subscriptions
  FROM relevant_users r
  JOIN public.profiles p ON p.user_id = r.user_id
), function_details AS (
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_function_result(p.oid) AS result,
         pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('can_write_data', 'set_trial_used_at', 'update_updated_at_column')
), object_constraints AS (
  SELECT c.relname AS table_name, con.conname,
         pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('subscriptions', 'asaas_webhook_events')
), object_indexes AS (
  SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename IN ('subscriptions', 'asaas_webhook_events')
), profile_columns AS (
  SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND (
       column_name LIKE 'trial_%'
       OR column_name IN (
         'user_id', 'created_at', 'updated_at', 'asaas_customer_id',
         'financial_status', 'current_period_end', 'current_plan_id',
         'current_plan_cycle', 'last_payment_id', 'last_payment_at',
         'is_blocked', 'blocked_reason', 'blocked_at', 'blocked_by',
         'manual_override', 'subscription_bump_at'
       )
     )
), profile_triggers AS (
  SELECT t.tgname, pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'profiles' AND NOT t.tgisinternal
), access_function_dependencies AS (
  SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
         d.deptype
    FROM pg_depend d
   WHERE d.refobjid = to_regprocedure('public.my_access_state()')
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'access_cases', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.account_key) FROM access_cases a), '[]'::jsonb),
  'plans', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'name', p.name, 'active', p.active,
    'trial_days', to_jsonb(p)->>'trial_days', 'sort_order', to_jsonb(p)->>'sort_order'
  )) ORDER BY p.name) FROM public.plans p), '[]'::jsonb),
  'profile_columns', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.column_name) FROM profile_columns c), '[]'::jsonb),
  'profile_triggers', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tgname) FROM profile_triggers t), '[]'::jsonb),
  'function_details', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.proname, f.arguments) FROM function_details f), '[]'::jsonb),
  'constraints', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name, c.conname) FROM object_constraints c), '[]'::jsonb),
  'indexes', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.table_name, i.indexname) FROM object_indexes i), '[]'::jsonb),
  'my_access_state_dependencies', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM access_function_dependencies d), '[]'::jsonb)
) AS diagnostico_complementar;
