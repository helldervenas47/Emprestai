-- READ ONLY. Run on the external Supabase before scheduling the migration.
-- Save the definitions and review counts; this script never changes access.
SELECT version();
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('is_access_blocked','is_trial_expired','has_active_subscription','my_access_state','get_data_owner_id');
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','subscriptions','loans','expenses');
SELECT trigger_name,action_timing,event_manipulation,action_statement
 FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='profiles';
SELECT environment,status,count(*) AS subscriptions,
 count(*) FILTER(WHERE current_period_end IS NULL) AS without_expiration,
 count(*) FILTER(WHERE product_id='free_plan') AS free,
 count(*) FILTER(WHERE coalesce((to_jsonb(s)->>'manual_override')::boolean,false)) AS manual
 FROM public.subscriptions s GROUP BY environment,status ORDER BY environment,status;
SELECT count(*) AS profile_only_future_access
 FROM public.profiles p WHERE (to_jsonb(p)->>'current_period_end')::timestamptz>now()
 AND NOT EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.user_id=p.user_id AND s.environment='live');
SELECT to_jsonb(p)->>'manual_override' AS legacy_override,count(*)
 FROM public.profiles p GROUP BY to_jsonb(p)->>'manual_override';
SELECT count(*) AS duplicate_account_environment_groups FROM (
 SELECT user_id,environment FROM public.subscriptions GROUP BY user_id,environment HAVING count(*)>1
) duplicates;
SELECT column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='asaas_webhook_events' ORDER BY ordinal_position;
