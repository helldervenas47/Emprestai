-- REVISAO SUPABASE 2026-09-06.6
-- Apply first to an isolated copy of the external database. No gateway calls.
-- Gateway entitlements and manual decisions are stored independently.
BEGIN;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS financial_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS current_plan_id uuid,
  ADD COLUMN IF NOT EXISTS current_plan_cycle text,
  ADD COLUMN IF NOT EXISTS last_payment_id text,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid,
  ADD COLUMN IF NOT EXISTS manual_override text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_plan_name text,
  ADD COLUMN IF NOT EXISTS trial_days_override integer,
  ADD COLUMN IF NOT EXISTS subscription_bump_at timestamptz;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_override_by uuid,
  ADD COLUMN IF NOT EXISTS manual_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_note text;
CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid, target_user_id uuid NOT NULL,
 admin_user_id uuid NOT NULL, action text NOT NULL, before jsonb, after jsonb, note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text UNIQUE, event_type text NOT NULL,
 payment_id text, customer_id text, user_id uuid, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'received', error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
ALTER TABLE public.asaas_webhook_events
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Bancos antigos do EmprestAI criaram esta coluna como `error`. Mantemos a
-- coluna legada e copiamos seu conteúdo para o contrato atual, sem apagar o
-- histórico nem quebrar consumidores antigos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'asaas_webhook_events'
       AND column_name = 'error'
  ) THEN
    EXECUTE $sql$
      UPDATE public.asaas_webhook_events
         SET error_message = error
       WHERE error_message IS NULL
         AND error IS NOT NULL
    $sql$;
  END IF;
END $$;

CREATE TABLE public.billing_runtime_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 environment text NOT NULL DEFAULT 'live' CHECK(environment IN ('live','sandbox'))
);
INSERT INTO public.billing_runtime_config DEFAULT VALUES;
ALTER TABLE public.billing_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_runtime_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billing_runtime_config TO service_role;

CREATE TABLE public.billing_accounts (
 user_id uuid NOT NULL REFERENCES auth.users(id), environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 baseline jsonb, manual_state jsonb, PRIMARY KEY(user_id, environment)
);
CREATE TABLE public.billing_customers (
 user_id uuid NOT NULL REFERENCES auth.users(id), environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 customer_id text NOT NULL, PRIMARY KEY(user_id,environment), UNIQUE(environment,customer_id)
);
CREATE TABLE public.billing_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 environment text NOT NULL CHECK(environment IN ('live','sandbox')), request_key uuid NOT NULL,
 plan_id uuid NOT NULL REFERENCES public.plans(id), product_id text NOT NULL,
 cycle text NOT NULL CHECK(cycle IN ('monthly','semestral','annual')),
 amount_cents bigint NOT NULL CHECK(amount_cents > 0), days integer NOT NULL CHECK(days IN (30,180,365)),
 checkout_kind text NOT NULL DEFAULT 'pix' CHECK(checkout_kind IN ('pix','recurring')),
 customer_id text, payment_id text, status text NOT NULL DEFAULT 'creating',
 invoice_url text, due_date date, credited_at timestamptz, revoked_at timestamptz,
 review_reason text, checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,environment,request_key), UNIQUE(environment,payment_id)
);
CREATE TABLE public.billing_contracts (
 subscription_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 order_id uuid NOT NULL REFERENCES public.billing_orders(id), checked_at timestamptz, scan_offset integer NOT NULL DEFAULT 0, PRIMARY KEY(environment,subscription_id)
);
ALTER TABLE public.billing_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_contracts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billing_contracts TO service_role;
CREATE UNIQUE INDEX billing_one_creating ON public.billing_orders(user_id,environment) WHERE status='creating';
CREATE INDEX billing_one_pending_plan ON public.billing_orders(user_id,environment,plan_id,cycle) WHERE status IN ('creating','pending');
CREATE INDEX billing_orders_reconcile ON public.billing_orders(environment,checked_at NULLS FIRST);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_accounts, public.billing_customers, public.billing_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_accounts, public.billing_customers, public.billing_orders, public.asaas_webhook_events, public.subscription_audit_log TO service_role;
GRANT SELECT ON public.billing_orders TO authenticated;
DROP POLICY IF EXISTS billing_order_owner_read ON public.billing_orders;
CREATE POLICY billing_order_owner_read ON public.billing_orders FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.billing_product_id(_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN n LIKE '%basic%' THEN 'basico_plan' WHEN n LIKE '%prof%' THEN 'profissional_plan'
 WHEN n LIKE '%empres%' THEN 'empresarial_plan'
 WHEN n IN ('free','gratis','trial','teste') THEN 'free_plan'
 ELSE trim(both '_' from regexp_replace(n,'[^a-z0-9]+','_','g')) || '_plan' END
 FROM (SELECT lower(translate(_name,'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) n) p
$$;
UPDATE public.subscriptions s SET plan_id=p.id FROM public.plans p
 WHERE s.plan_id IS NULL AND s.product_id=public.billing_product_id(p.name)
 AND (SELECT count(*) FROM public.plans p2 WHERE public.billing_product_id(p2.name)=s.product_id)=1;

-- Valores antigos diferentes das duas decisoes administrativas suportadas
-- nunca foram considerados pelo aplicativo. Remove o resíduo antes de proteger
-- a coluna; liberações com data permanecem na assinatura manual correspondente.
UPDATE public.profiles
   SET manual_override=NULL
 WHERE manual_override IS NOT NULL
   AND manual_override NOT IN ('BANNED','FREE_PASS');

-- Instalações antigas chegaram a projetar uma liberação sandbox no perfil
-- compartilhado. Materializa apenas o prazo já concedido como uma liberação
-- manual live; não copia cobranças nem cria acesso sem vencimento.
INSERT INTO public.subscriptions(
  user_id,environment,paddle_subscription_id,paddle_customer_id,
  product_id,price_id,plan_id,status,current_period_start,current_period_end,
  cancel_at_period_end,manual_override,manual_override_at,manual_note
)
SELECT p.user_id,'live','legacy_profile_'||p.user_id,'legacy_profile_'||p.user_id,
       coalesce(sb.product_id,'profissional_plan'),
       coalesce(sb.price_id,'profissional_plan_manual'),
       coalesce(sb.plan_id,(
         SELECT candidate.id FROM public.plans candidate
          WHERE public.billing_product_id(candidate.name)=coalesce(sb.product_id,'profissional_plan')
          ORDER BY candidate.active DESC,candidate.id LIMIT 1
       )),
       'active',coalesce(sb.current_period_start,now()),p.current_period_end,
       false,true,now(),'Migração: prazo live preservado a partir do perfil legado'
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT s.* FROM public.subscriptions s
     WHERE s.user_id=p.user_id AND s.environment='sandbox'
     ORDER BY s.updated_at DESC,s.id LIMIT 1
  ) sb ON true
 WHERE p.current_period_end>now()
   AND NOT EXISTS (
     SELECT 1 FROM public.subscriptions live
      WHERE live.user_id=p.user_id AND live.environment='live'
   )
ON CONFLICT(user_id,environment) DO NOTHING;

-- Um registro pago sem vencimento e sem identificadores Asaas não comprova
-- pagamento. Para clientes, converte o acesso atual em 30 dias de transição.
-- Administradores continuam cobertos pela exceção administrativa do acesso.
UPDATE public.subscriptions s
   SET current_period_start=coalesce(s.current_period_start,now()),
       current_period_end=now()+interval '30 days',
       manual_override=true,
       manual_override_at=now(),
       manual_note=coalesce(s.manual_note,'Migração: transição de 30 dias para assinatura legada sem vencimento'),
       updated_at=now()
 WHERE s.environment='live'
   AND s.status IN ('active','paid','trialing','canceled')
   AND s.current_period_end IS NULL
   AND nullif(s.asaas_payment_id,'') IS NULL
   AND nullif(s.asaas_subscription_id,'') IS NULL
   AND NOT public.has_role(s.user_id,'admin');

-- Protect billing columns even if the existing self-profile UPDATE grant is broad.
-- SECURITY INVOKER: current_user must remain the caller, not the trigger owner.
CREATE OR REPLACE FUNCTION public.protect_profile_billing() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE keys text[] := ARRAY['asaas_customer_id','financial_status','current_period_end','current_plan_id',
 'current_plan_cycle','last_payment_id','last_payment_at','is_blocked','blocked_reason','blocked_at',
 'blocked_by','manual_override','trial_started_at','trial_plan_name','trial_days_override','subscription_bump_at','created_at']; k text;
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR auth.role()='service_role' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
   -- Preserve the existing signup/upsert path, but ignore caller-supplied privileges.
   NEW := jsonb_populate_record(NEW, jsonb_build_object(
     'asaas_customer_id',NULL,'financial_status',NULL,'current_period_end',NULL,'current_plan_id',NULL,
     'current_plan_cycle',NULL,'last_payment_id',NULL,'last_payment_at',NULL,'is_blocked',false,
     'blocked_reason',NULL,'blocked_at',NULL,'blocked_by',NULL,'manual_override',NULL,
     'trial_started_at',now(),'trial_plan_name',NULL,'trial_days_override',NULL,'subscription_bump_at',NULL,'created_at',now()));
   RETURN NEW;
 END IF;
 FOREACH k IN ARRAY keys LOOP
   IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k THEN
     RAISE EXCEPTION 'Billing fields are managed by the server' USING ERRCODE='42501';
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_billing ON public.profiles;
CREATE TRIGGER protect_profile_billing BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing();

-- Every writer serializes on the same account key. No transaction spans network I/O.
CREATE OR REPLACE FUNCTION public.billing_init_account(_uid uuid, _env text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb;
BEGIN
 IF _env NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text||':'||_env,0));
 SELECT to_jsonb(x) INTO s FROM public.subscriptions x WHERE user_id=_uid AND environment=_env;
 INSERT INTO public.billing_accounts(user_id,environment,baseline,manual_state)
 VALUES(_uid,_env,CASE WHEN coalesce((s->>'manual_override')::boolean,false) THEN NULL ELSE s END,
 CASE WHEN coalesce((s->>'manual_override')::boolean,false) THEN s ELSE NULL END)
 ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.billing_refresh_account(_uid uuid, _env text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.billing_accounts; state jsonb; o public.billing_orders; ending timestamptz; starting timestamptz; saved public.subscriptions;
BEGIN
 PERFORM public.billing_init_account(_uid,_env);
 SELECT * INTO a FROM public.billing_accounts WHERE user_id=_uid AND environment=_env FOR UPDATE;
 state := a.baseline;
 IF state->>'status' IN ('active','paid','trialing') OR (state->>'status'='canceled' AND (state->>'cancel_at_period_end')::boolean) THEN
   ending := (state->>'current_period_end')::timestamptz;
 END IF;
 FOR o IN SELECT * FROM public.billing_orders WHERE user_id=_uid AND environment=_env
   AND credited_at IS NOT NULL AND revoked_at IS NULL ORDER BY credited_at,id LOOP
   starting := o.credited_at;
   ending := greatest(coalesce(ending,starting),starting) + make_interval(days=>o.days);
   state := jsonb_build_object('plan_id',o.plan_id,'product_id',o.product_id,'price_id',o.product_id||'_'||o.cycle,
     'status','active','current_period_start',starting,'current_period_end',ending,'cancel_at_period_end',false,
     'asaas_payment_id',o.payment_id,'asaas_customer_id',o.customer_id);
 END LOOP;
 -- Manual access is independent of gateway credits, including an explicit expiration.
 IF a.manual_state IS NOT NULL THEN state := a.manual_state; END IF;
 state := coalesce(state,jsonb_build_object('product_id','free_plan','price_id','free','status','expired'));
 INSERT INTO public.subscriptions(user_id,environment,paddle_subscription_id,paddle_customer_id,product_id,price_id,
   plan_id,status,current_period_start,current_period_end,cancel_at_period_end,manual_override,manual_override_by,
   manual_override_at,manual_note,asaas_payment_id,asaas_customer_id,updated_at)
 VALUES(_uid,_env,'billing_'||_uid||'_'||_env,'billing_'||_uid,
   state->>'product_id',coalesce(state->>'price_id','manual'),(state->>'plan_id')::uuid,
   state->>'status',(state->>'current_period_start')::timestamptz,(state->>'current_period_end')::timestamptz,
   coalesce((state->>'cancel_at_period_end')::boolean,false),a.manual_state IS NOT NULL,
   (state->>'manual_override_by')::uuid,(state->>'manual_override_at')::timestamptz,state->>'manual_note',
   state->>'asaas_payment_id',state->>'asaas_customer_id',now())
 ON CONFLICT(user_id,environment) DO UPDATE SET product_id=excluded.product_id,price_id=excluded.price_id,plan_id=excluded.plan_id,
   status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
   cancel_at_period_end=excluded.cancel_at_period_end,manual_override=excluded.manual_override,
   manual_override_by=excluded.manual_override_by,manual_override_at=excluded.manual_override_at,manual_note=excluded.manual_note,
   asaas_payment_id=excluded.asaas_payment_id,asaas_customer_id=excluded.asaas_customer_id,updated_at=now()
 RETURNING * INTO saved;
 -- Only live data may change the shared production profile. Never touch admin block here.
 IF _env=(SELECT environment FROM public.billing_runtime_config WHERE singleton) THEN
   UPDATE public.profiles
      SET current_period_end=saved.current_period_end
    WHERE user_id=_uid;
   UPDATE public.profiles
      SET current_plan_id=saved.plan_id
    WHERE user_id=_uid;
   UPDATE public.profiles
      SET financial_status=(
        CASE
          WHEN coalesce(saved.manual_override,false) THEN
            CASE WHEN saved.current_period_end>now() THEN 'ACTIVE' ELSE 'INACTIVE' END
          WHEN saved.status IN ('active','paid','trialing','canceled')
            AND saved.current_period_end>now()
            AND coalesce(saved.current_period_start<=now(),true)
          THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END
      )
    WHERE user_id=_uid;
   UPDATE public.profiles
      SET subscription_bump_at=now()
    WHERE user_id=_uid;
 END IF;
 RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION public.billing_prepare_order(_uid uuid,_env text,_key uuid,_plan uuid,_cycle text,_cents bigint,_kind text DEFAULT 'pix')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.billing_orders; p public.plans;
BEGIN
 PERFORM public.billing_init_account(_uid,_env);
 IF _kind NOT IN ('pix','recurring') OR _cycle NOT IN ('monthly','semestral','annual') OR _cents<=0 THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=_plan AND active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
 SELECT * INTO o FROM public.billing_orders WHERE user_id=_uid AND environment=_env AND request_key=_key;
 IF FOUND THEN
   IF o.plan_id<>_plan OR o.cycle<>_cycle OR o.checkout_kind<>_kind THEN RAISE EXCEPTION 'request_key_conflict'; END IF;
   RETURN jsonb_build_object('created',false,'order',to_jsonb(o));
 END IF;
 SELECT * INTO o FROM public.billing_orders WHERE user_id=_uid AND environment=_env
   AND ((plan_id=_plan AND cycle=_cycle AND checkout_kind=_kind AND status='pending') OR status='creating') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
   IF o.plan_id<>_plan OR o.cycle<>_cycle OR o.checkout_kind<>_kind THEN RAISE EXCEPTION 'checkout_in_progress'; END IF;
   RETURN jsonb_build_object('created',false,'order',to_jsonb(o));
 END IF;
 INSERT INTO public.billing_orders(user_id,environment,request_key,plan_id,product_id,cycle,amount_cents,days,checkout_kind)
 VALUES(_uid,_env,_key,_plan,public.billing_product_id(p.name),_cycle,_cents,
 CASE _cycle WHEN 'annual' THEN 365 WHEN 'semestral' THEN 180 ELSE 30 END,_kind) RETURNING * INTO o;
 RETURN jsonb_build_object('created',true,'order',to_jsonb(o));
END $$;

-- Receives an authoritative GET /payments result, not an unverified client payload.
CREATE OR REPLACE FUNCTION public.billing_apply_payment(_env text,_event_id text,_event_type text,_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.billing_orders; template public.billing_orders; e public.asaas_webhook_events; paid boolean; revoked boolean; issue text; state jsonb;
BEGIN
 IF _env NOT IN ('live','sandbox') OR coalesce(_payment->>'id','')='' THEN RAISE EXCEPTION 'invalid_payment'; END IF;
 SELECT * INTO o FROM public.billing_orders WHERE environment=_env AND payment_id=_payment->>'id';
 IF NOT FOUND AND _payment->>'subscription' IS NOT NULL THEN
   SELECT bo.* INTO template FROM public.billing_contracts c JOIN public.billing_orders bo ON bo.id=c.order_id
     WHERE c.environment=_env AND c.subscription_id=_payment->>'subscription';
   IF template.id IS NOT NULL AND template.customer_id=_payment->>'customer'
      AND template.id::text=_payment->>'externalReference' THEN
     PERFORM public.billing_init_account(template.user_id,_env);
     SELECT * INTO o FROM public.billing_orders WHERE environment=_env AND payment_id=_payment->>'id';
     IF o.id IS NULL THEN
       IF template.payment_id IS NULL THEN o:=template;
       ELSE
         INSERT INTO public.billing_orders(user_id,environment,request_key,plan_id,product_id,cycle,amount_cents,days,customer_id,payment_id,status,checkout_kind)
         VALUES(template.user_id,_env,gen_random_uuid(),template.plan_id,template.product_id,template.cycle,template.amount_cents,template.days,
          template.customer_id,_payment->>'id','pending','recurring') RETURNING * INTO o;
       END IF;
     END IF;
   END IF;
 END IF;
 IF o.id IS NULL THEN
   SELECT * INTO o FROM public.billing_orders WHERE environment=_env AND id::text=_payment->>'externalReference';
 END IF;
 IF template.id IS NULL AND _payment->>'subscription' IS NOT NULL THEN
   SELECT bo.* INTO template FROM public.billing_contracts c JOIN public.billing_orders bo ON bo.id=c.order_id
     WHERE c.environment=_env AND c.subscription_id=_payment->>'subscription'
       AND bo.user_id=o.user_id AND bo.id::text=_payment->>'externalReference' AND bo.customer_id=_payment->>'customer';
 END IF;
 IF o.id IS NOT NULL THEN PERFORM public.billing_init_account(o.user_id,_env); END IF;
 INSERT INTO public.asaas_webhook_events(event_id,event_type,environment,payment_id,customer_id,user_id,payload)
 VALUES(_env||':'||_event_id,_event_type,_env,_payment->>'id',_payment->>'customer',o.user_id,
   jsonb_build_object('id',_payment->>'id','status',_payment->>'status','value',_payment->'value','externalReference',_payment->>'externalReference'))
 ON CONFLICT(event_id) DO NOTHING;
 SELECT * INTO e FROM public.asaas_webhook_events WHERE event_id=_env||':'||_event_id FOR UPDATE;
 IF e.status='processed' THEN RETURN jsonb_build_object('duplicated',true); END IF;
 IF o.id IS NULL THEN issue:='unknown_order';
 ELSIF o.customer_id IS NULL OR o.customer_id IS DISTINCT FROM _payment->>'customer' THEN issue:='customer_mismatch';
 ELSIF o.payment_id IS NOT NULL AND o.payment_id IS DISTINCT FROM _payment->>'id' THEN issue:='payment_mismatch';
 ELSIF o.id::text IS DISTINCT FROM _payment->>'externalReference' AND template.id IS NULL THEN issue:='reference_mismatch';
 ELSIF round((_payment->>'value')::numeric*100) IS DISTINCT FROM o.amount_cents::numeric THEN issue:='amount_mismatch'; END IF;
 IF issue IS NOT NULL THEN
   UPDATE public.asaas_webhook_events SET status='review',error_message=issue,processed_at=now() WHERE id=e.id;
   IF o.id IS NOT NULL THEN UPDATE public.billing_orders SET review_reason=issue,checked_at=coalesce((_payment->>'_observed_at')::timestamptz,now()) WHERE id=o.id; END IF;
   RETURN jsonb_build_object('review',issue);
 END IF;
 SELECT * INTO o FROM public.billing_orders WHERE id=o.id FOR UPDATE;
 IF _payment->>'_observed_at' IS NOT NULL AND o.checked_at > (_payment->>'_observed_at')::timestamptz THEN
   UPDATE public.asaas_webhook_events SET status='processed',error_message='older_snapshot_ignored',processed_at=now() WHERE id=e.id;
   RETURN jsonb_build_object('stale',true);
 END IF;
 paid := _payment->>'status' IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH');
 revoked := _payment->>'status' IN ('REFUNDED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL')
   OR coalesce((_payment->>'deleted')::boolean,false);
 -- Partial refunds need an explicit commercial decision; preserve current rights and flag review.
 IF _event_type='PAYMENT_PARTIALLY_REFUNDED' OR jsonb_array_length(CASE WHEN jsonb_typeof(_payment->'refunds')='array' THEN _payment->'refunds' ELSE '[]'::jsonb END)>0 AND paid THEN
   issue:='partial_refund_review';
 END IF;
 UPDATE public.billing_orders SET payment_id=_payment->>'id',invoice_url=_payment->>'invoiceUrl',due_date=(_payment->>'dueDate')::date,
   credited_at=CASE WHEN paid AND NOT revoked THEN coalesce(credited_at,now()) ELSE credited_at END,
   revoked_at=CASE WHEN revoked THEN coalesce(revoked_at,now())
     WHEN paid THEN NULL WHEN credited_at IS NOT NULL AND _payment->>'status' IN ('PENDING','OVERDUE') THEN coalesce(revoked_at,now()) ELSE revoked_at END,
   status=CASE WHEN revoked THEN 'revoked' WHEN paid THEN 'paid' ELSE 'pending' END,
   review_reason=issue,checked_at=coalesce((_payment->>'_observed_at')::timestamptz,now()) WHERE id=o.id;
 state:=public.billing_refresh_account(o.user_id,_env);
 UPDATE public.asaas_webhook_events SET status=CASE WHEN issue IS NULL THEN 'processed' ELSE 'review' END,
   error_message=issue,processed_at=now() WHERE id=e.id;
 IF _env=(SELECT environment FROM public.billing_runtime_config WHERE singleton) AND paid THEN
   UPDATE public.profiles SET last_payment_id=_payment->>'id',last_payment_at=now() WHERE user_id=o.user_id;
 END IF;
 RETURN jsonb_build_object('processed',true,'order_id',o.id,'review',issue,'subscription',state);
END $$;

CREATE OR REPLACE FUNCTION public.billing_admin_action(_admin uuid,_env text,_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=(_body->>'target_user_id')::uuid; action text:=_body->>'action'; s jsonb; previous jsonb;
 p public.plans; profile_before jsonb; ending timestamptz; starting timestamptz; days integer; note text:=nullif(trim(_body->>'note'),'');
BEGIN
 IF NOT public.has_role(_admin,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF uid IS NULL OR coalesce(public.get_data_owner_id(uid),uid)<>uid THEN RAISE EXCEPTION 'Manage the account owner subscription'; END IF;
 PERFORM public.billing_init_account(uid,_env);
 SELECT to_jsonb(x) INTO profile_before FROM public.profiles x WHERE user_id=uid FOR UPDATE;
 IF profile_before IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
 PERFORM public.billing_init_account(uid,_env);
 SELECT to_jsonb(x) INTO s FROM public.subscriptions x WHERE user_id=uid AND environment=_env;
 previous:=s;
 IF action IN ('block_user','unblock_user','suspend','reactivate') AND _env<>(SELECT environment FROM public.billing_runtime_config WHERE singleton) THEN RAISE EXCEPTION 'Admin blocking requires live environment'; END IF;
 IF action='block_user' OR action='suspend' THEN
   IF note IS NULL THEN RAISE EXCEPTION 'Informe o motivo do bloqueio'; END IF;
   UPDATE public.profiles SET is_blocked=true,blocked_reason=note,blocked_at=now(),blocked_by=_admin WHERE user_id=uid;
 ELSIF action='unblock_user' OR action='reactivate' THEN
   IF action='reactivate' AND (s IS NULL OR coalesce((s->>'current_period_end')::timestamptz,now())<=now()) THEN
     RAISE EXCEPTION 'Assinatura vencida. Use Renovar ou Liberar plano para conceder dias.';
   END IF;
   UPDATE public.profiles SET is_blocked=false,blocked_reason=NULL,blocked_at=NULL,blocked_by=NULL WHERE user_id=uid;
 ELSIF action='set_username' THEN
   IF nullif(_body->>'username','') IS NOT NULL AND lower(trim(_body->>'username')) !~ '^[a-z0-9._-]{3,30}$' THEN RAISE EXCEPTION 'invalid_username'; END IF;
   UPDATE public.profiles SET username=nullif(lower(trim(_body->>'username')),'') WHERE user_id=uid;
 ELSIF action='update_note' THEN
   IF s IS NULL THEN RAISE EXCEPTION 'Sem assinatura'; END IF;
   UPDATE public.subscriptions SET manual_note=note,updated_at=now() WHERE user_id=uid AND environment=_env;
   UPDATE public.billing_accounts SET manual_state=CASE WHEN manual_state IS NOT NULL THEN manual_state||jsonb_build_object('manual_note',note) ELSE NULL END,
     baseline=CASE WHEN baseline IS NOT NULL THEN baseline||jsonb_build_object('manual_note',note) ELSE NULL END WHERE user_id=uid AND environment=_env;
 ELSIF action='clear_override' THEN
   UPDATE public.billing_accounts SET manual_state=NULL WHERE user_id=uid AND environment=_env;
   s:=public.billing_refresh_account(uid,_env);
 ELSIF action IN ('grant_plan','set_dates','start_trial','extend_trial','set_days_remaining','renew','cancel') THEN
   IF action IN ('set_dates','extend_trial','cancel') AND s IS NULL THEN RAISE EXCEPTION 'Sem assinatura'; END IF;
   IF action IN ('grant_plan','start_trial') THEN
     SELECT * INTO p FROM public.plans WHERE active=true AND
       (id::text=_body->>'plan_id' OR (_body->>'plan_id' IS NULL AND
        (public.billing_product_id(name)=_body->>'product_id' OR lower(name)=lower(_body->>'product_id'))));
     IF p.id IS NULL THEN RAISE EXCEPTION 'Selecione um plano válido'; END IF;
   ELSE
     SELECT * INTO p FROM public.plans WHERE id=(s->>'plan_id')::uuid;
     IF p.id IS NULL THEN SELECT * INTO p FROM public.plans WHERE public.billing_product_id(name)=s->>'product_id' AND active=true; END IF;
     IF p.id IS NULL THEN RAISE EXCEPTION 'Selecione um plano antes de conceder dias'; END IF;
   END IF;
   starting:=coalesce((s->>'current_period_start')::timestamptz,now());
   ending:=coalesce((s->>'current_period_end')::timestamptz,now());
   IF action='grant_plan' THEN
     starting:=coalesce((_body->>'start_date')::timestamptz,now());
     ending:=coalesce((_body->>'end_date')::timestamptz,greatest(ending,now()+interval '30 days'));
   ELSIF action='set_dates' THEN
     starting:=(_body->>'start_date')::timestamptz; ending:=(_body->>'end_date')::timestamptz;
   ELSIF action IN ('start_trial','set_days_remaining','renew','extend_trial') THEN
     IF coalesce(_body->>'trial_days','') !~ '^-?[0-9]+$' THEN RAISE EXCEPTION 'Dias inválidos'; END IF;
     days:=(_body->>'trial_days')::integer;
     IF abs(days)>3650 OR (action<>'extend_trial' AND days<0) OR (action IN ('renew','extend_trial') AND days=0)
       OR (action='start_trial' AND days>365) THEN RAISE EXCEPTION 'Dias inválidos'; END IF;
     IF action IN ('start_trial','set_days_remaining') THEN starting:=now(); ending:=now()+make_interval(days=>days);
     ELSE ending:=greatest(ending,now())+make_interval(days=>days); END IF;
   END IF;
   IF starting IS NULL OR ending IS NULL OR ending<starting OR NOT isfinite(starting) OR NOT isfinite(ending) THEN RAISE EXCEPTION 'Datas inválidas'; END IF;
   s:=coalesce(s,'{}'::jsonb)||jsonb_build_object('plan_id',p.id,'product_id',public.billing_product_id(p.name),
     'price_id',public.billing_product_id(p.name)||'_manual','current_period_start',starting,'current_period_end',ending,
     'status',CASE WHEN ending<=now() THEN 'expired' WHEN action='start_trial' THEN 'trialing' ELSE 'active' END,
     'cancel_at_period_end',action='cancel','manual_override_by',_admin,'manual_override_at',now(),'manual_note',note);
   UPDATE public.billing_accounts SET manual_state=s WHERE user_id=uid AND environment=_env;
   s:=public.billing_refresh_account(uid,_env);
 ELSE RAISE EXCEPTION 'unknown_action'; END IF;
 -- Suspend is a separate account block; it does not destroy paid status/days.
 IF _env=(SELECT environment FROM public.billing_runtime_config WHERE singleton) THEN UPDATE public.profiles SET subscription_bump_at=now(),updated_at=now() WHERE user_id=uid; END IF;
 SELECT to_jsonb(x) INTO s FROM public.subscriptions x WHERE user_id=uid AND environment=_env;
 INSERT INTO public.subscription_audit_log(subscription_id,target_user_id,admin_user_id,action,before,after,note)
 VALUES((s->>'id')::uuid,uid,_admin,action,jsonb_build_object('subscription',previous,'profile',profile_before),
 jsonb_build_object('subscription',s,'profile',(SELECT to_jsonb(x) FROM public.profiles x WHERE user_id=uid)),note);
 RETURN jsonb_build_object('subscription',s);
END $$;

-- Authoritative live access; both RLS helpers delegate here, no exception => allow fallback.
CREATE OR REPLACE FUNCTION public.billing_access_state(_uid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 WITH resolved AS (
   SELECT coalesce(public.get_data_owner_id($1),$1) AS owner_id
 ), account_data AS (
   SELECT r.owner_id,p.user_id AS profile_user_id,p.is_blocked,p.manual_override AS profile_override,
          p.blocked_reason,p.financial_status,p.trial_started_at,p.created_at,p.trial_days_override,
          s.id AS subscription_id,s.product_id,s.status,s.current_period_start,s.current_period_end,
          s.cancel_at_period_end,s.manual_override AS subscription_override,
          coalesce(p.trial_started_at,p.created_at)
            + make_interval(days=>coalesce(p.trial_days_override,chosen_plan.trial_days,7)) AS trial_end
     FROM resolved r
     LEFT JOIN public.profiles p ON p.user_id=r.owner_id
     LEFT JOIN public.subscriptions s ON s.user_id=r.owner_id
       AND s.environment=(SELECT c.environment FROM public.billing_runtime_config c WHERE c.singleton)
     LEFT JOIN LATERAL (
       SELECT candidate.trial_days
         FROM public.plans candidate
        WHERE candidate.active=true
        ORDER BY CASE WHEN lower(candidate.name)=lower(p.trial_plan_name) THEN 0 ELSE 1 END,
                 candidate.sort_order NULLS LAST,candidate.id
        LIMIT 1
     ) chosen_plan ON true
 ), decision AS (
   SELECT a.*,
          CASE
            WHEN coalesce(a.subscription_override,false) THEN true
            WHEN a.status IN ('active','trialing','paid') THEN true
            WHEN a.status='canceled' THEN coalesce(a.cancel_at_period_end,false)
            ELSE false
          END AS subscription_allowed,
          CASE
            WHEN a.subscription_id IS NULL THEN a.trial_end
            WHEN a.product_id IN ('free_plan','free','trial','teste') THEN a.trial_end
            ELSE a.current_period_end
          END AS effective_end
     FROM account_data a
 ), result AS (
   SELECT d.*,
          CASE
            WHEN $1 IS NULL THEN true
            WHEN d.profile_user_id IS NULL THEN true
            WHEN coalesce(d.is_blocked,false) THEN true
            WHEN d.profile_override='BANNED' THEN true
            WHEN public.has_role($1,'admin') THEN false
            WHEN d.profile_override='FREE_PASS' THEN false
            WHEN d.product_id NOT IN ('free_plan','free','trial','teste')
              AND d.current_period_end>now()
              AND coalesce(d.current_period_start<=now(),true)
              AND d.subscription_allowed THEN false
            WHEN d.subscription_id IS NULL THEN coalesce(d.trial_end<=now(),true)
            WHEN d.product_id IN ('free_plan','free','trial','teste') THEN coalesce(d.trial_end<=now(),true)
            ELSE true
          END AS locked
     FROM decision d
 )
 SELECT CASE
   WHEN $1 IS NULL THEN jsonb_build_object('locked',true,'reason','unauthenticated')
   WHEN profile_user_id IS NULL THEN jsonb_build_object('locked',true,'reason','profile_missing')
   ELSE jsonb_build_object(
     'owner_id',owner_id,'locked',locked,
     'reason',CASE WHEN locked AND (coalesce(is_blocked,false) OR profile_override='BANNED')
                   THEN 'admin_blocked' WHEN locked THEN 'plan_expired' ELSE NULL END,
     'blocked_reason',blocked_reason,'financial_status',financial_status,'current_period_end',effective_end
   )
 END
 FROM result
$function$;
-- Mantém o contrato RPC já publicado: Supabase devolve uma linha com estas
-- três colunas. A regra interna continua centralizada em billing_access_state.
CREATE OR REPLACE FUNCTION public.my_access_state()
RETURNS TABLE(blocked boolean, reason text, period_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((state->>'locked')::boolean,true),
        state->>'reason',
        (state->>'current_period_end')::timestamptz
   FROM (SELECT public.billing_access_state(auth.uid()) AS state) resolved
$$;
CREATE OR REPLACE FUNCTION public.is_access_blocked(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT coalesce((public.billing_access_state(_user_id)->>'locked')::boolean,true) $$;
CREATE OR REPLACE FUNCTION public.is_trial_expired(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.is_access_blocked(_user_id) $$;
-- Keep legacy signatures aligned with the same finite-period rule.
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 SELECT coalesce(bool_or(
   s.product_id NOT IN ('free_plan','free','trial','teste')
   AND s.current_period_end>now()
   AND coalesce(s.current_period_start<=now(),true)
   AND CASE
     WHEN coalesce(s.manual_override,false) THEN true
     WHEN s.status IN ('active','trialing','paid') THEN true
     WHEN s.status='canceled' THEN coalesce(s.cancel_at_period_end,false)
     ELSE false
   END
 ),false)
 FROM public.subscriptions s
 WHERE s.user_id=$1
   AND s.environment=(SELECT c.environment FROM public.billing_runtime_config c WHERE c.singleton)
$function$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid,check_env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 SELECT coalesce(bool_or(
   s.product_id NOT IN ('free_plan','free','trial','teste')
   AND s.current_period_end>now()
   AND coalesce(s.current_period_start<=now(),true)
   AND CASE
     WHEN coalesce(s.manual_override,false) THEN true
     WHEN s.status IN ('active','trialing','paid') THEN true
     WHEN s.status='canceled' THEN coalesce(s.cancel_at_period_end,false)
     ELSE false
   END
 ),false)
 FROM public.subscriptions s
 WHERE s.user_id=$1 AND s.environment=$2
$function$;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.billing_admin_list(_admin uuid,_env text,_search text DEFAULT '',_status text DEFAULT '',_limit integer DEFAULT 100,_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(_admin,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH matching AS (
   SELECT p.*,u.email,to_jsonb(s) AS subscription FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
   LEFT JOIN public.subscriptions s ON s.user_id=p.user_id AND s.environment=_env
   WHERE (_search='' OR p.display_name ILIKE '%'||_search||'%' OR p.username ILIKE '%'||_search||'%' OR u.email ILIKE '%'||_search||'%')
   AND (_status='' OR coalesce(s.status,'none')=_status)
 ), page AS (SELECT * FROM matching ORDER BY created_at DESC,user_id LIMIT greatest(1,least(_limit,200)) OFFSET greatest(0,_offset))
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
 'total',(SELECT count(*) FROM matching),'plans',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.plans p WHERE active=true),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.billing_admin_list(uuid,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_list(uuid,text,text,text,integer,integer) TO service_role;

REVOKE ALL ON FUNCTION public.billing_init_account(uuid,text),public.billing_refresh_account(uuid,text),
 public.billing_prepare_order(uuid,text,uuid,uuid,text,bigint,text),public.billing_apply_payment(text,text,text,jsonb),
 public.billing_admin_action(uuid,text,jsonb),public.billing_access_state(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_init_account(uuid,text),public.billing_refresh_account(uuid,text),
 public.billing_prepare_order(uuid,text,uuid,uuid,text,bigint,text),public.billing_apply_payment(text,text,text,jsonb),
 public.billing_admin_action(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.my_access_state(),public.is_access_blocked(uuid),public.is_trial_expired(uuid),public.has_active_subscription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_access_state(),public.is_access_blocked(uuid),public.is_trial_expired(uuid),public.has_active_subscription(uuid) TO authenticated,service_role;
-- Ensure billing write enforcement also exists on installations that never ran
-- the old manual SQL files. Existing ownership policies remain in force.
DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['loans','payments','loan_installments','expenses','incomes','sales',
 'account_ledger','credit_cards','credit_card_invoices','credit_card_invoice_openings','credit_limits',
 'credit_limit_history','balance','balance_adjustments','monthly_opening_balances','stock_movements',
 'products','payrolls','payroll_payments','manager_commissions','piggy_banks','clients','monthly_goals',
 'monthly_goal_snapshots','vehicle_registry','vehicle_balance','personal_budgets','personal_categories',
 'personal_expense_categories','income_categories','user_telegram_bots','whatsapp_billing_schedule',
 'webhook_settings','my_boletos','my_boleto_payments','boleto_lookups','locador_info'] LOOP
   IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
   EXECUTE format('DROP POLICY IF EXISTS billing_write_insert ON public.%I',tbl);
   EXECUTE format('DROP POLICY IF EXISTS billing_write_update ON public.%I',tbl);
   EXECUTE format('DROP POLICY IF EXISTS billing_write_delete ON public.%I',tbl);
   EXECUTE format('CREATE POLICY billing_write_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_access_blocked(auth.uid()))',tbl);
   EXECUTE format('CREATE POLICY billing_write_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_access_blocked(auth.uid())) WITH CHECK (NOT public.is_access_blocked(auth.uid()))',tbl);
   EXECUTE format('CREATE POLICY billing_write_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_access_blocked(auth.uid()))',tbl);
 END LOOP;
END $$;
COMMIT;
