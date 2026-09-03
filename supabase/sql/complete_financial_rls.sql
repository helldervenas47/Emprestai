-- Step 8 — Complete RLS for financial tables.
-- Apply on the EXTERNAL Supabase project (where the financial data lives).
--
-- Goals:
--   1. Garantir que `has_role` e `app_role` existam (idempotente).
--   2. Garantir RLS habilitado e políticas completas (SELECT/INSERT/UPDATE/DELETE)
--      em todas as tabelas financeiras críticas, escopadas por
--      `user_id = auth.uid() OR user_id = public.get_data_owner_id(auth.uid())`.
--   3. Garantir GRANTs ao role `authenticated` (sem acesso `anon`).
--
-- O script usa DROP POLICY IF EXISTS + CREATE POLICY para ser re-executável.

-- 1) app_role enum + user_roles + has_role (idempotente) ---------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'moderator', 'user');
  end if;
end$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_self_read" on public.user_roles;
create policy "user_roles_self_read"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- 2) Helper: owner-aware predicate ------------------------------------------
-- Usa get_data_owner_id se já existir (já confirmado no projeto).

-- 3) Apply complete policies to financial tables ----------------------------

do $$
declare
  tbl text;
  tables text[] := array[
    'loans',
    'payments',
    'loan_installments',
    'expenses',
    'incomes',
    'sales',
    'account_ledger',
    'credit_cards',
    'credit_card_invoices',
    'credit_card_invoice_openings',
    'credit_limits',
    'credit_limit_history',
    'balance',
    'balance_adjustments',
    'monthly_opening_balances',
    'stock_movements',
    'products',
    'payrolls',
    'payroll_payments',
    'manager_commissions',
    'piggy_banks'
  ];
begin
  foreach tbl in array tables loop
    -- skip tables that don't exist
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = tbl
    ) then
      raise notice 'skipping % (not found)', tbl;
      continue;
    end if;

    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_select_owner" on public.%I
      for select to authenticated
      using (
        user_id = auth.uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_insert_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_insert_owner" on public.%I
      for insert to authenticated
      with check (
        user_id = auth.uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_update_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_update_owner" on public.%I
      for update to authenticated
      using (
        user_id = auth.uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
      with check (
        user_id = auth.uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);

    execute format('drop policy if exists "%s_delete_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_delete_owner" on public.%I
      for delete to authenticated
      using (
        user_id = auth.uid()
        or user_id = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl);
  end loop;
end$$;

-- 4) Special-case: loan_installments has no user_id; scope via parent loan.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='loan_installments' and column_name='loan_id'
  )
  and not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='loan_installments' and column_name='user_id'
  ) then
    drop policy if exists "loan_installments_select_owner" on public.loan_installments;
    drop policy if exists "loan_installments_insert_owner" on public.loan_installments;
    drop policy if exists "loan_installments_update_owner" on public.loan_installments;
    drop policy if exists "loan_installments_delete_owner" on public.loan_installments;

    create policy "loan_installments_select_via_loan" on public.loan_installments
      for select to authenticated
      using (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = auth.uid() or l.user_id = public.get_data_owner_id(auth.uid()))
      ));

    create policy "loan_installments_write_via_loan" on public.loan_installments
      for all to authenticated
      using (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = auth.uid() or l.user_id = public.get_data_owner_id(auth.uid()))
      ))
      with check (exists (
        select 1 from public.loans l
         where l.id = loan_installments.loan_id
           and (l.user_id = auth.uid() or l.user_id = public.get_data_owner_id(auth.uid()))
      ));
  end if;
end$$;
