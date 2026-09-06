-- Production billing is live-only. Preserve sandbox data in a protected archive,
-- carry forward valid manual grants when live has no stronger entitlement, and
-- prevent new operational sandbox rows from being created.
BEGIN;

UPDATE public.billing_runtime_config
   SET environment = 'live'
 WHERE singleton;

ALTER TABLE public.subscriptions
  ALTER COLUMN environment SET DEFAULT 'live';

CREATE TABLE IF NOT EXISTS public.billing_sandbox_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_key text NOT NULL,
  user_id uuid,
  payload jsonb NOT NULL,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_key)
);

ALTER TABLE public.billing_sandbox_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_sandbox_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_sandbox_archive TO service_role;

INSERT INTO public.billing_sandbox_archive(source_table, source_key, user_id, payload, reason)
SELECT 'subscriptions', id::text, user_id, to_jsonb(s), 'Migração definitiva para billing live'
  FROM public.subscriptions s
 WHERE environment = 'sandbox'
ON CONFLICT (source_table, source_key) DO NOTHING;

INSERT INTO public.billing_sandbox_archive(source_table, source_key, user_id, payload, reason)
SELECT 'billing_accounts', user_id::text || ':sandbox', user_id, to_jsonb(a), 'Migração definitiva para billing live'
  FROM public.billing_accounts a
 WHERE environment = 'sandbox'
ON CONFLICT (source_table, source_key) DO NOTHING;

INSERT INTO public.billing_sandbox_archive(source_table, source_key, user_id, payload, reason)
SELECT 'billing_customers', user_id::text || ':sandbox', user_id, to_jsonb(c), 'Migração definitiva para billing live'
  FROM public.billing_customers c
 WHERE environment = 'sandbox'
ON CONFLICT (source_table, source_key) DO NOTHING;

INSERT INTO public.billing_sandbox_archive(source_table, source_key, user_id, payload, reason)
SELECT 'billing_orders', id::text, user_id, to_jsonb(o), 'Migração definitiva para billing live'
  FROM public.billing_orders o
 WHERE environment = 'sandbox'
ON CONFLICT (source_table, source_key) DO NOTHING;

INSERT INTO public.billing_sandbox_archive(source_table, source_key, user_id, payload, reason)
SELECT 'billing_contracts', subscription_id, o.user_id, to_jsonb(c), 'Migração definitiva para billing live'
  FROM public.billing_contracts c
  JOIN public.billing_orders o ON o.id = c.order_id
 WHERE c.environment = 'sandbox'
ON CONFLICT (source_table, source_key) DO NOTHING;

-- A future, explicit manual grant made in sandbox is retained only when the
-- live account has no Asaas payment/contract and no equal or longer live term.
UPDATE public.subscriptions live
   SET product_id = sb.product_id,
       price_id = coalesce(nullif(sb.price_id, ''), sb.product_id || '_manual'),
       plan_id = sb.plan_id,
       status = 'active',
       current_period_start = coalesce(sb.current_period_start, now()),
       current_period_end = sb.current_period_end,
       cancel_at_period_end = false,
       manual_override = true,
       manual_override_by = sb.manual_override_by,
       manual_override_at = coalesce(sb.manual_override_at, now()),
       manual_note = concat_ws(' | ', nullif(sb.manual_note, ''), 'Migração sandbox → live'),
       updated_at = now()
  FROM public.subscriptions sb
 WHERE live.user_id = sb.user_id
   AND live.environment = 'live'
   AND sb.environment = 'sandbox'
   AND sb.manual_override = true
   AND sb.current_period_end > now()
   AND NOT public.has_role(sb.user_id, 'admin')
   AND nullif(live.asaas_payment_id, '') IS NULL
   AND nullif(live.asaas_subscription_id, '') IS NULL
   AND (live.current_period_end IS NULL OR live.current_period_end < sb.current_period_end);

-- Accounts without a live row receive either their still-valid explicit manual
-- grant or an expired free record. Sandbox payment identifiers are never copied.
INSERT INTO public.subscriptions(
  user_id, environment, paddle_subscription_id, paddle_customer_id,
  product_id, price_id, plan_id, status, current_period_start,
  current_period_end, cancel_at_period_end, manual_override,
  manual_override_by, manual_override_at, manual_note
)
SELECT sb.user_id,
       'live',
       'sandbox_migration_' || sb.id::text,
       'sandbox_migration_' || sb.user_id::text,
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN sb.product_id ELSE 'free_plan' END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now()
            THEN coalesce(nullif(sb.price_id, ''), sb.product_id || '_manual') ELSE 'free' END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN sb.plan_id ELSE NULL END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN 'active' ELSE 'expired' END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now()
            THEN coalesce(sb.current_period_start, now()) ELSE now() END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN sb.current_period_end ELSE now() END,
       false,
       sb.manual_override AND sb.current_period_end > now(),
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN sb.manual_override_by END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now() THEN coalesce(sb.manual_override_at, now()) END,
       CASE WHEN sb.manual_override AND sb.current_period_end > now()
            THEN concat_ws(' | ', nullif(sb.manual_note, ''), 'Migração sandbox → live')
            ELSE 'Sandbox encerrado; sem direito live vigente' END
  FROM public.subscriptions sb
 WHERE sb.environment = 'sandbox'
   AND NOT EXISTS (
     SELECT 1 FROM public.subscriptions live
      WHERE live.user_id = sb.user_id AND live.environment = 'live'
   )
ON CONFLICT (user_id, environment) DO NOTHING;

-- Remove operational sandbox state after it has been archived.
DELETE FROM public.billing_contracts WHERE environment = 'sandbox';
DELETE FROM public.billing_orders WHERE environment = 'sandbox';
DELETE FROM public.billing_customers WHERE environment = 'sandbox';
DELETE FROM public.billing_accounts WHERE environment = 'sandbox';
DELETE FROM public.subscriptions WHERE environment = 'sandbox';

-- New accounts start with one live free/trial row only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, trial_started_at, trial_plan_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), now(), 'Teste Grátis');

  INSERT INTO public.subscriptions (
    user_id, paddle_subscription_id, paddle_customer_id,
    product_id, price_id, status, environment
  ) VALUES (
    NEW.id, 'free_' || NEW.id::text || '_live', 'free_customer_' || NEW.id::text,
    'free_plan', 'free', 'active', 'live'
  );

  PERFORM public.seed_default_payment_methods(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_non_live_billing_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.environment <> 'live' THEN
    RAISE EXCEPTION 'billing_environment_must_be_live' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS subscriptions_live_only ON public.subscriptions;
CREATE TRIGGER subscriptions_live_only
BEFORE INSERT OR UPDATE OF environment ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.reject_non_live_billing_write();

DROP TRIGGER IF EXISTS billing_accounts_live_only ON public.billing_accounts;
CREATE TRIGGER billing_accounts_live_only
BEFORE INSERT OR UPDATE OF environment ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.reject_non_live_billing_write();

DROP TRIGGER IF EXISTS billing_customers_live_only ON public.billing_customers;
CREATE TRIGGER billing_customers_live_only
BEFORE INSERT OR UPDATE OF environment ON public.billing_customers
FOR EACH ROW EXECUTE FUNCTION public.reject_non_live_billing_write();

DROP TRIGGER IF EXISTS billing_orders_live_only ON public.billing_orders;
CREATE TRIGGER billing_orders_live_only
BEFORE INSERT OR UPDATE OF environment ON public.billing_orders
FOR EACH ROW EXECUTE FUNCTION public.reject_non_live_billing_write();

DROP TRIGGER IF EXISTS billing_contracts_live_only ON public.billing_contracts;
CREATE TRIGGER billing_contracts_live_only
BEFORE INSERT OR UPDATE OF environment ON public.billing_contracts
FOR EACH ROW EXECUTE FUNCTION public.reject_non_live_billing_write();

-- Reproject profile billing fields from the single authoritative live record.
UPDATE public.profiles p
   SET current_plan_id = s.plan_id,
       current_period_end = (public.billing_access_state(p.user_id)->>'current_period_end')::timestamptz,
       financial_status = CASE
         WHEN coalesce((public.billing_access_state(p.user_id)->>'locked')::boolean, true)
           THEN 'INACTIVE'
         ELSE 'ACTIVE'
       END,
       subscription_bump_at = now(),
       updated_at = now()
  FROM public.subscriptions s
 WHERE s.user_id = p.user_id
   AND s.environment = 'live';

COMMIT;
