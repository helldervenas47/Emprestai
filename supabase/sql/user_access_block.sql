-- ============================================================================
-- Módulo: Bloqueio manual de usuário + trava global de acesso
-- Rodar UMA vez no Supabase EXTERNO (projeto principal).
-- Idempotente: pode reexecutar sem quebrar.
--
-- Semântica:
--   is_access_blocked(uid) = true quando:
--     (a) o admin marcou profiles.is_blocked = true  OU
--     (b) o trial expirou (is_trial_expired) e não há assinatura paga ativa.
--
--   Enquanto is_access_blocked = true, toda escrita nas tabelas de domínio
--   é rejeitada por RLS (mesmo comportamento hoje aplicado a trial_expired).
--   O front-end mostra a tela de bloqueio; só a aba Sistema permanece.
-- ============================================================================

-- 1) Colunas de bloqueio manual em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text NULL,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS blocked_by uuid NULL;

CREATE INDEX IF NOT EXISTS profiles_is_blocked_idx
  ON public.profiles (is_blocked) WHERE is_blocked = true;

-- 2) Função unificada: bloqueio manual OU trial expirado (owner-aware)
CREATE OR REPLACE FUNCTION public.is_access_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _blocked boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  _owner := COALESCE(public.get_data_owner_id(_user_id), _user_id);

  -- (a) bloqueio manual do admin
  SELECT COALESCE(is_blocked, false) INTO _blocked
  FROM public.profiles
  WHERE user_id = _owner
  LIMIT 1;

  IF _blocked THEN
    RETURN true;
  END IF;

  -- (b) trial expirado sem assinatura paga
  RETURN public.is_trial_expired(_owner);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_access_blocked(uuid) TO authenticated, service_role;

-- 3) Substitui as policies de write-block para usar a função unificada.
--    (mantém as policies antigas "*_block_*_trial_expired" removidas para não
--    conflitar; a nova função já cobre o caso trial expirado.)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'loans','payments','loan_installments','expenses','incomes','sales',
    'account_ledger','credit_cards','credit_card_invoices',
    'credit_card_invoice_openings','credit_limits','credit_limit_history',
    'balance','balance_adjustments','monthly_opening_balances',
    'stock_movements','products','payrolls','payroll_payments',
    'manager_commissions','piggy_banks','clients','monthly_goals',
    'monthly_goal_snapshots','vehicle_registry','vehicle_balance',
    'personal_budgets','personal_categories','personal_expense_categories',
    'income_categories','user_telegram_bots','whatsapp_billing_schedule',
    'webhook_settings','my_boletos','my_boleto_payments','boleto_lookups',
    'locador_info'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=tbl
    ) THEN CONTINUE; END IF;

    -- Remove policies antigas (trial_expired) para evitar duplicidade
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_insert_trial_expired" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_update_trial_expired" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_delete_trial_expired" ON public.%I', tbl, tbl);

    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_insert_access" ON public.%I', tbl, tbl);
    EXECUTE format($f$
      CREATE POLICY "%s_block_insert_access" ON public.%I
      AS RESTRICTIVE
      FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_access_blocked(auth.uid()))
    $f$, tbl, tbl);

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_update_access" ON public.%I', tbl, tbl);
    EXECUTE format($f$
      CREATE POLICY "%s_block_update_access" ON public.%I
      AS RESTRICTIVE
      FOR UPDATE TO authenticated
      USING (NOT public.is_access_blocked(auth.uid()))
      WITH CHECK (NOT public.is_access_blocked(auth.uid()))
    $f$, tbl, tbl);

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS "%s_block_delete_access" ON public.%I', tbl, tbl);
    EXECUTE format($f$
      CREATE POLICY "%s_block_delete_access" ON public.%I
      AS RESTRICTIVE
      FOR DELETE TO authenticated
      USING (NOT public.is_access_blocked(auth.uid()))
    $f$, tbl, tbl);
  END LOOP;
END$$;

-- 4) Policy explícita: usuários podem ler o próprio flag de bloqueio.
--    (Já está coberto pelas policies de leitura de profiles; nada a fazer.)

-- Rollback:
--   DO $$ DECLARE tbl text; BEGIN
--     FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema='public' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS "%s_block_insert_access" ON public.%I', tbl, tbl);
--       EXECUTE format('DROP POLICY IF EXISTS "%s_block_update_access" ON public.%I', tbl, tbl);
--       EXECUTE format('DROP POLICY IF EXISTS "%s_block_delete_access" ON public.%I', tbl, tbl);
--     END LOOP;
--   END$$;
--   DROP FUNCTION IF EXISTS public.is_access_blocked(uuid);
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS is_blocked,
--     DROP COLUMN IF EXISTS blocked_reason,
--     DROP COLUMN IF EXISTS blocked_at,
--     DROP COLUMN IF EXISTS blocked_by;
