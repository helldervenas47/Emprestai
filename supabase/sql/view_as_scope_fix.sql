-- View-as scope fix
-- Problem: when admin starts a "view as" session, the app shows both the
-- target user's data AND the admin's own data, because RLS policies use
--   user_id = auth.uid() OR user_id = public.get_data_owner_id(auth.uid())
-- The auth.uid() leg always lets the admin see their own rows.
--
-- Fix:
--   1) Redefine get_data_owner_id() to return the viewing target when an
--      admin_viewing_sessions row exists for the caller.
--   2) Introduce effective_auth_uid() which returns NULL while viewing,
--      otherwise auth.uid(). Use it in policies in place of auth.uid()
--      so the admin's own rows disappear while viewing.
--   3) Recreate policies on financial tables to use effective_auth_uid().
--
-- Idempotent / re-runnable.

-- 0) Ensure the admin_viewing_sessions table exists with expected shape.
create table if not exists public.admin_viewing_sessions (
  admin_id uuid primary key references auth.users(id) on delete cascade,
  viewing_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
grant select, insert, update, delete on public.admin_viewing_sessions to authenticated;
grant all on public.admin_viewing_sessions to service_role;
alter table public.admin_viewing_sessions enable row level security;
drop policy if exists "avs_admin_self" on public.admin_viewing_sessions;
create policy "avs_admin_self" on public.admin_viewing_sessions
  for all to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid() and public.has_role(auth.uid(), 'admin'::public.app_role));

-- 1) get_data_owner_id honors admin viewing sessions.
create or replace function public.get_data_owner_id(_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _viewing uuid;
  _owner_id uuid;
begin
  select viewing_user_id into _viewing
    from public.admin_viewing_sessions
   where admin_id = _user_id
   limit 1;
  if _viewing is not null then
    return _viewing;
  end if;

  select owner_id into _owner_id from public.user_owner where user_id = _user_id;
  return coalesce(_owner_id, _user_id);
end;
$$;

grant execute on function public.get_data_owner_id(uuid) to authenticated, service_role;

-- 2) effective_auth_uid(): NULL while viewing, else auth.uid().
create or replace function public.effective_auth_uid()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.admin_viewing_sessions where admin_id = auth.uid()
    ) then null
    else auth.uid()
  end;
$$;

grant execute on function public.effective_auth_uid() to authenticated, service_role;

-- 3) Recreate policies on financial tables.
do $$
declare
  tbl text;
  tables text[] := array[
    'loans','payments','expenses','incomes','sales',
    'account_ledger','credit_cards','credit_card_invoices',
    'credit_card_invoice_openings','credit_limits','credit_limit_history',
    'balance','balance_adjustments','monthly_opening_balances',
    'stock_movements','products','payrolls','payroll_payments',
    'manager_commissions','piggy_banks','clients','my_boletos',
    'my_boleto_payments','monthly_goals','monthly_goal_snapshots',
    'personal_budgets','personal_categories','personal_expense_categories',
    'chart_overrides','income_categories','locador_info','vehicle_registry',
    'vehicle_balance'
  ];
begin
  foreach tbl in array tables loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema='public' and table_name=tbl
    ) then continue; end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=tbl and column_name='user_id'
    ) then continue; end if;

    execute format('drop policy if exists "%s_select_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_select_owner" on public.%I
      for select to authenticated
      using (
        user_id = public.effective_auth_uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_insert_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_insert_owner" on public.%I
      for insert to authenticated
      with check (
        user_id = public.effective_auth_uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_update_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_update_owner" on public.%I
      for update to authenticated
      using (
        user_id = public.effective_auth_uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
      with check (
        user_id = public.effective_auth_uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_delete_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_delete_owner" on public.%I
      for delete to authenticated
      using (
        user_id = public.effective_auth_uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);
  end loop;
end$$;

-- 4) loan_installments: scope via parent loan.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='loan_installments' and column_name='loan_id'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='loan_installments' and column_name='user_id'
  ) then
    drop policy if exists "loan_installments_select_via_loan" on public.loan_installments;
    drop policy if exists "loan_installments_write_via_loan" on public.loan_installments;

    create policy "loan_installments_select_via_loan" on public.loan_installments
      for select to authenticated
      using (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = public.effective_auth_uid()
                or l.user_id = public.get_data_owner_id(auth.uid()))
      ));

    create policy "loan_installments_write_via_loan" on public.loan_installments
      for all to authenticated
      using (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = public.effective_auth_uid()
                or l.user_id = public.get_data_owner_id(auth.uid()))
      ))
      with check (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = public.effective_auth_uid()
                or l.user_id = public.get_data_owner_id(auth.uid()))
      ));
  end if;
end$$;
