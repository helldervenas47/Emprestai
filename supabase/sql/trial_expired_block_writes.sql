-- Trial-expired write blocking — apply on EXTERNAL Supabase project.
--
-- Goals:
--   1. Function public.is_trial_expired(_user_id uuid) returns boolean.
--      Owner-aware: uses get_data_owner_id so sub-users inherit the owner's status.
--      Returns false if the user has any active paid subscription.
--      Returns true if trial_expires_at (or trial_started_at + plan trial_days) is in the past
--      AND no active paid subscription exists.
--   2. Block INSERT/UPDATE/DELETE on all domain tables when is_trial_expired(auth.uid()) is true.
--      SELECT remains allowed (read-only mode).
--   3. Idempotent (re-runnable).

-- 1) Helper function ---------------------------------------------------------

create or replace function public.is_trial_expired(_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _owner uuid;
  _has_paid boolean;
  _trial_expires timestamptz;
  _trial_started timestamptz;
  _plan_trial_days int;
begin
  if _user_id is null then
    return false;
  end if;

  _owner := coalesce(public.get_data_owner_id(_user_id), _user_id);

  -- Any active paid subscription? -> not expired
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = _owner
      and coalesce(s.status, '') in ('active','trialing','paid')
      and (s.current_period_end is null or s.current_period_end > now())
      and coalesce(s.plan_slug, s.plan_id::text, '') not in ('free','trial','teste')
  ) into _has_paid;

  if _has_paid then
    return false;
  end if;

  -- Explicit trial_expires_at on subscriptions
  select max(s.trial_expires_at) into _trial_expires
  from public.subscriptions s
  where s.user_id = _owner;

  if _trial_expires is not null then
    return _trial_expires < now();
  end if;

  -- Fallback: profiles.trial_started_at + plans.trial_days
  select p.trial_started_at into _trial_started
  from public.profiles p
  where p.user_id = _owner
  limit 1;

  if _trial_started is null then
    return false;
  end if;

  select coalesce(max(pl.trial_days), 7) into _plan_trial_days
  from public.plans pl
  where coalesce(pl.slug, '') in ('free','trial','teste');

  return (_trial_started + (coalesce(_plan_trial_days,7) || ' days')::interval) < now();
exception when others then
  return false;
end;
$$;

grant execute on function public.is_trial_expired(uuid) to authenticated, service_role;

-- 2) Apply write-block policies to all domain tables ------------------------

do $$
declare
  tbl text;
  tables text[] := array[
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
begin
  foreach tbl in array tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=tbl
    ) then
      continue;
    end if;

    -- INSERT block
    execute format('drop policy if exists "%s_block_insert_trial_expired" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_block_insert_trial_expired" on public.%I
      as restrictive
      for insert to authenticated
      with check (not public.is_trial_expired(auth.uid()))
    $f$, tbl, tbl);

    -- UPDATE block
    execute format('drop policy if exists "%s_block_update_trial_expired" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_block_update_trial_expired" on public.%I
      as restrictive
      for update to authenticated
      using (not public.is_trial_expired(auth.uid()))
      with check (not public.is_trial_expired(auth.uid()))
    $f$, tbl, tbl);

    -- DELETE block
    execute format('drop policy if exists "%s_block_delete_trial_expired" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_block_delete_trial_expired" on public.%I
      as restrictive
      for delete to authenticated
      using (not public.is_trial_expired(auth.uid()))
    $f$, tbl, tbl);
  end loop;
end$$;

-- To rollback the write-block (without dropping the function):
--   do $$ declare tbl text; begin
--     for tbl in select table_name from information_schema.tables
--                where table_schema='public' loop
--       execute format('drop policy if exists "%s_block_insert_trial_expired" on public.%I', tbl, tbl);
--       execute format('drop policy if exists "%s_block_update_trial_expired" on public.%I', tbl, tbl);
--       execute format('drop policy if exists "%s_block_delete_trial_expired" on public.%I', tbl, tbl);
--     end loop;
--   end$$;
