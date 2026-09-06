-- MIGRATION: 20260906200000_billing_upgrade_downgrade_and_quotas.sql
-- 1. Upgrade proporcional e Downgrade seguro em billing_refresh_account
-- 2. Enforcement server-side das cotas de planos (loans, clients) com locks de concorrência
-- 3. Agendamento versionado de conciliação automática via pg_cron

BEGIN;

-- 1. Adicionar colunas de suporte se não existirem
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_clients integer;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_id uuid REFERENCES public.plans(id);

-- Atualizar limites padrão dos planos existentes
UPDATE public.plans SET max_clients = 200 WHERE name ILIKE '%Básico%' AND max_clients IS NULL;
UPDATE public.plans SET max_clients = 1000 WHERE name ILIKE '%Profissional%' AND max_clients IS NULL;

-- 2. Atualizar billing_refresh_account para upgrade proporcional e downgrade seguro
CREATE OR REPLACE FUNCTION public.billing_refresh_account(_uid uuid, _env text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.billing_accounts;
  state jsonb;
  o public.billing_orders;
  ending timestamptz;
  starting timestamptz;
  saved public.subscriptions;
  has_paid boolean := false;
  manual_ending timestamptz;

  -- Variáveis de cálculo econômico e transição de plano
  current_plan_id uuid;
  current_product_id text;
  current_cycle text;
  current_daily_cents bigint;
  order_daily_cents bigint;
  remaining_days integer;
  unused_value_cents bigint;
  converted_days integer;
  
  -- Planos agendados (downgrade)
  scheduled_plan uuid := NULL;
  scheduled_product text := NULL;
  superior_plan_end timestamptz := NULL;
BEGIN
  PERFORM public.billing_init_account(_uid, _env);
  SELECT * INTO a FROM public.billing_accounts WHERE user_id = _uid AND environment = _env FOR UPDATE;

  -- 1. Baseline inicial
  state := a.baseline;
  IF state->>'status' IN ('active', 'paid', 'trialing') OR (state->>'status' = 'canceled' AND (state->>'cancel_at_period_end')::boolean) THEN
    ending := (state->>'current_period_end')::timestamptz;
    current_plan_id := (state->>'plan_id')::uuid;
    current_product_id := state->>'product_id';
  END IF;

  -- 2. Se houver override manual ativo com data futura, preserva como base para soma
  IF a.manual_state IS NOT NULL THEN
    manual_ending := (a.manual_state->>'current_period_end')::timestamptz;
    IF manual_ending IS NOT NULL AND manual_ending > now() THEN
      ending := greatest(coalesce(ending, now()), manual_ending);
      current_plan_id := (a.manual_state->>'plan_id')::uuid;
      current_product_id := a.manual_state->>'product_id';
    END IF;
    state := a.manual_state;
  END IF;

  -- 3. Itera sobre todas as ordens pagas e aprovadas do gateway
  FOR o IN SELECT * FROM public.billing_orders
            WHERE user_id = _uid AND environment = _env
              AND credited_at IS NOT NULL AND revoked_at IS NULL
            ORDER BY credited_at, id LOOP
    has_paid := true;
    starting := coalesce(o.credited_at, now());
    order_daily_cents := greatest(1, o.amount_cents / greatest(1, o.days));

    IF current_plan_id IS NULL OR current_plan_id = o.plan_id THEN
      -- CASO A: Primeira contratação ou Renovação do mesmo plano
      ending := greatest(coalesce(ending, starting), starting, now()) + make_interval(days => o.days);
      current_plan_id := o.plan_id;
      current_product_id := o.product_id;
      current_cycle := o.cycle;
      current_daily_cents := order_daily_cents;
    ELSE
      -- CASO B: Mudança de Plano (Upgrade ou Downgrade)
      -- Calcula dias restantes pagos do plano anterior no momento do crédito
      IF ending IS NOT NULL AND ending > starting THEN
        remaining_days := greatest(0, ceil(extract(epoch from (ending - starting)) / 86400.0)::integer);
      ELSE
        remaining_days := 0;
      END IF;

      current_daily_cents := coalesce(current_daily_cents, order_daily_cents);

      IF order_daily_cents > current_daily_cents AND remaining_days > 0 THEN
        -- UPGRADE: Plano novo tem valor diário superior
        -- Converte o saldo residual econômico em dias do novo plano
        unused_value_cents := remaining_days::bigint * current_daily_cents;
        converted_days := floor(unused_value_cents::numeric / order_daily_cents::numeric)::integer;
        
        -- O novo plano entra em vigor imediatamente a partir de 'starting'
        ending := starting + make_interval(days => (converted_days + o.days));
        current_plan_id := o.plan_id;
        current_product_id := o.product_id;
        current_cycle := o.cycle;
        current_daily_cents := order_daily_cents;
        scheduled_plan := NULL;
        scheduled_product := NULL;
      ELSIF order_daily_cents <= current_daily_cents AND remaining_days > 0 THEN
        -- DOWNGRADE: Plano novo tem valor diário inferior
        -- Preserva o plano superior até o final do período já pago (ending)
        superior_plan_end := ending;
        ending := ending + make_interval(days => o.days);
        
        -- Se ainda estamos dentro do período do plano superior, mantém o plano superior como ativo
        IF now() < superior_plan_end THEN
          scheduled_plan := o.plan_id;
          scheduled_product := o.product_id;
        ELSE
          current_plan_id := o.plan_id;
          current_product_id := o.product_id;
          current_cycle := o.cycle;
          current_daily_cents := order_daily_cents;
          scheduled_plan := NULL;
          scheduled_product := NULL;
        END IF;
      ELSE
        -- Período anterior já expirado
        ending := greatest(coalesce(ending, starting), starting, now()) + make_interval(days => o.days);
        current_plan_id := o.plan_id;
        current_product_id := o.product_id;
        current_cycle := o.cycle;
        current_daily_cents := order_daily_cents;
      END IF;
    END IF;

    state := jsonb_build_object(
      'plan_id', current_plan_id,
      'product_id', current_product_id,
      'price_id', current_product_id || '_' || coalesce(current_cycle, o.cycle),
      'status', 'active',
      'current_period_start', coalesce((state->>'current_period_start')::timestamptz, starting),
      'current_period_end', ending,
      'cancel_at_period_end', false,
      'asaas_payment_id', o.payment_id,
      'asaas_customer_id', o.customer_id,
      'manual_override', false,
      'scheduled_plan_id', scheduled_plan
    );
  END LOOP;

  -- 4. Se não houver nenhum pagamento registrado, mantém estritamente o manual_state
  IF NOT has_paid AND a.manual_state IS NOT NULL THEN
    state := a.manual_state;
  END IF;

  state := coalesce(state, jsonb_build_object('product_id', 'free_plan', 'price_id', 'free', 'status', 'expired'));

  INSERT INTO public.subscriptions (
    user_id, environment, paddle_subscription_id, paddle_customer_id, product_id, price_id,
    plan_id, status, current_period_start, current_period_end, cancel_at_period_end, manual_override,
    manual_override_by, manual_override_at, manual_note, asaas_payment_id, asaas_customer_id, updated_at,
    scheduled_plan_id
  ) VALUES (
    _uid, _env, 'billing_' || _uid || '_' || _env, 'billing_' || _uid,
    state->>'product_id', coalesce(state->>'price_id', 'manual'), (state->>'plan_id')::uuid,
    state->>'status', (state->>'current_period_start')::timestamptz, (state->>'current_period_end')::timestamptz,
    coalesce((state->>'cancel_at_period_end')::boolean, false),
    CASE WHEN has_paid THEN false ELSE (a.manual_state IS NOT NULL) END,
    (state->>'manual_override_by')::uuid, (state->>'manual_override_at')::timestamptz, state->>'manual_note',
    state->>'asaas_payment_id', state->>'asaas_customer_id', now(),
    (state->>'scheduled_plan_id')::uuid
  )
  ON CONFLICT (user_id, environment) DO UPDATE SET
    product_id = excluded.product_id,
    price_id = excluded.price_id,
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    manual_override = excluded.manual_override,
    manual_override_by = excluded.manual_override_by,
    manual_override_at = excluded.manual_override_at,
    manual_note = excluded.manual_note,
    asaas_payment_id = excluded.asaas_payment_id,
    asaas_customer_id = excluded.asaas_customer_id,
    scheduled_plan_id = excluded.scheduled_plan_id,
    updated_at = now()
  RETURNING * INTO saved;

  IF _env = (SELECT environment FROM public.billing_runtime_config WHERE singleton) THEN
    UPDATE public.profiles
       SET current_period_end = saved.current_period_end,
           current_plan_id = saved.plan_id,
           financial_status = CASE
             WHEN coalesce(saved.manual_override, false) THEN
               CASE WHEN saved.current_period_end > now() THEN 'ACTIVE' ELSE 'INACTIVE' END
             WHEN saved.status IN ('active', 'paid', 'trialing', 'canceled')
               AND saved.current_period_end > now()
               AND coalesce(saved.current_period_start <= now(), true)
             THEN 'ACTIVE'
             ELSE 'INACTIVE'
           END,
           subscription_bump_at = now()
     WHERE user_id = _uid;
  END IF;

  RETURN to_jsonb(saved);
END $$;

-- 3. Funções e Triggers de Enforcement Server-Side das Cotas de Planos

CREATE OR REPLACE FUNCTION public.get_user_plan_limits(_user_id uuid)
RETURNS TABLE(max_loans integer, max_clients integer, max_users integer, plan_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH resolved_owner AS (
    SELECT coalesce(public.get_data_owner_id(_user_id), _user_id) AS owner_id
  ), active_sub AS (
    SELECT s.plan_id, s.product_id, s.status, s.current_period_end
      FROM resolved_owner r
      LEFT JOIN public.subscriptions s ON s.user_id = r.owner_id AND s.environment = 'live'
     LIMIT 1
  ), resolved_plan AS (
    SELECT p.*
      FROM active_sub sub
      LEFT JOIN public.plans p ON p.id = sub.plan_id OR (sub.plan_id IS NULL AND public.billing_product_id(p.name) = sub.product_id)
     WHERE p.active = true
     ORDER BY p.sort_order NULLS LAST, p.id
     LIMIT 1
  )
  SELECT 
    CASE 
      WHEN public.has_role(_user_id, 'admin') THEN NULL
      WHEN rp.id IS NOT NULL THEN rp.max_loans
      ELSE 50 -- Limite padrão seguro para contas sem plano específico
    END AS max_loans,
    CASE 
      WHEN public.has_role(_user_id, 'admin') THEN NULL
      WHEN rp.id IS NOT NULL THEN rp.max_clients
      ELSE 200
    END AS max_clients,
    CASE 
      WHEN public.has_role(_user_id, 'admin') THEN NULL
      WHEN rp.id IS NOT NULL THEN rp.max_users
      ELSE 1
    END AS max_users,
    coalesce(rp.name, 'Básico') AS plan_name
  FROM resolved_owner ro
  LEFT JOIN resolved_plan rp ON true;
$$;

-- Trigger para cota de empréstimos ativos
CREATE OR REPLACE FUNCTION public.enforce_plan_loan_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid := coalesce(public.get_data_owner_id(NEW.user_id), NEW.user_id);
  limits RECORD;
  current_count integer;
BEGIN
  -- Admin tem cota ilimitada
  IF public.has_role(auth.uid(), 'admin') OR current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;

  -- Só valida se o empréstimo inserido/atualizado for ativo
  IF coalesce(NEW.status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Lock transacional por proprietário para evitar estouro em inserções simultâneas
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text || ':loan_quota', 0));

  SELECT * INTO limits FROM public.get_user_plan_limits(owner_id);

  IF limits.max_loans IS NOT NULL THEN
    SELECT count(*) INTO current_count
      FROM public.loans
     WHERE user_id = owner_id
       AND status = 'active'
       AND id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF current_count >= limits.max_loans THEN
      RAISE EXCEPTION 'Limite de % empréstimos ativos atingido para o plano atual (%). Faça upgrade para continuar.', limits.max_loans, limits.plan_name
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_loan_quota_insert ON public.loans;
CREATE TRIGGER check_loan_quota_insert
BEFORE INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_loan_quota();

DROP TRIGGER IF EXISTS check_loan_quota_update ON public.loans;
CREATE TRIGGER check_loan_quota_update
BEFORE UPDATE OF status ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_loan_quota();

-- Trigger para cota de clientes
CREATE OR REPLACE FUNCTION public.enforce_plan_client_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid := coalesce(public.get_data_owner_id(NEW.user_id), NEW.user_id);
  limits RECORD;
  current_count integer;
BEGIN
  -- Admin tem cota ilimitada
  IF public.has_role(auth.uid(), 'admin') OR current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;

  -- Lock transacional por proprietário para evitar concorrência
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text || ':client_quota', 0));

  SELECT * INTO limits FROM public.get_user_plan_limits(owner_id);

  IF limits.max_clients IS NOT NULL THEN
    SELECT count(*) INTO current_count
      FROM public.clients
     WHERE user_id = owner_id
       AND id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF current_count >= limits.max_clients THEN
      RAISE EXCEPTION 'Limite de % clientes atingido para o plano atual (%). Faça upgrade para continuar.', limits.max_clients, limits.plan_name
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_client_quota_insert ON public.clients;
CREATE TRIGGER check_client_quota_insert
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_client_quota();

-- 4. Agendamento do cron job de conciliação no pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamento antigo se existir
    BEGIN
      PERFORM cron.unschedule('asaas-reconcile-5min');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Agenda a cada 5 minutos
    PERFORM cron.schedule(
      'asaas-reconcile-5min',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/asaas-reconcile',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            'strong_cron_secret_vault'
          )
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;

COMMIT;
