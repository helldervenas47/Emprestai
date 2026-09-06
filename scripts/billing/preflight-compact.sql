-- READ ONLY: reúne o diagnóstico de billing em uma única célula JSON.
-- Execute todo o arquivo no SQL Editor e copie o valor da coluna `diagnostico`.
SELECT jsonb_pretty(
  jsonb_build_object(
    'server_version', current_setting('server_version'),
    'functions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', p.proname,
          'arguments', pg_get_function_identity_arguments(p.oid),
          'definition', pg_get_functiondef(p.oid)
        )
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'is_access_blocked',
          'is_trial_expired',
          'has_active_subscription',
          'my_access_state',
          'get_data_owner_id'
        )
    ), '[]'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'table', tablename,
          'name', policyname,
          'permissive', permissive,
          'roles', roles,
          'command', cmd,
          'using', qual,
          'check', with_check
        )
        ORDER BY tablename, policyname
      )
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('profiles', 'subscriptions', 'loans', 'expenses')
    ), '[]'::jsonb),
    'profile_triggers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', trigger_name,
          'timing', action_timing,
          'event', event_manipulation,
          'statement', action_statement
        )
        ORDER BY trigger_name, event_manipulation
      )
      FROM information_schema.triggers
      WHERE event_object_schema = 'public'
        AND event_object_table = 'profiles'
    ), '[]'::jsonb),
    'subscriptions_by_status', COALESCE((
      SELECT jsonb_agg(to_jsonb(summary) ORDER BY environment, status)
      FROM (
        SELECT
          environment,
          status,
          count(*) AS subscriptions,
          count(*) FILTER (WHERE current_period_end IS NULL) AS without_expiration,
          count(*) FILTER (WHERE product_id = 'free_plan') AS free,
          count(*) FILTER (
            WHERE COALESCE((to_jsonb(s)->>'manual_override')::boolean, false)
          ) AS manual
        FROM public.subscriptions s
        GROUP BY environment, status
      ) summary
    ), '[]'::jsonb),
    'profile_only_future_access', (
      SELECT count(*)
      FROM public.profiles p
      WHERE NULLIF(to_jsonb(p)->>'current_period_end', '')::timestamptz > now()
        AND NOT EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = p.user_id
            AND s.environment = 'live'
        )
    ),
    'legacy_overrides', COALESCE((
      SELECT jsonb_object_agg(COALESCE(legacy_override, '<null>'), amount)
      FROM (
        SELECT
          to_jsonb(p)->>'manual_override' AS legacy_override,
          count(*) AS amount
        FROM public.profiles p
        GROUP BY to_jsonb(p)->>'manual_override'
      ) values_by_override
    ), '{}'::jsonb),
    'duplicate_account_environment_groups', (
      SELECT count(*)
      FROM (
        SELECT user_id, environment
        FROM public.subscriptions
        GROUP BY user_id, environment
        HAVING count(*) > 1
      ) duplicates
    ),
    'webhook_columns', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('name', column_name, 'type', data_type)
        ORDER BY ordinal_position
      )
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asaas_webhook_events'
    ), '[]'::jsonb)
  )
) AS diagnostico;
