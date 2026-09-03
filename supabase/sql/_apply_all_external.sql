-- Consolidated migration — Step 5.1 + 5.4 + 8
-- Apply on the EXTERNAL Supabase project (SQL Editor).
-- Idempotente: pode ser re-executado sem efeitos colaterais.

-- ==============================================================
-- 1) atomic_balance_adjust
-- ==============================================================
-- Step 5.1 — Atomic balance adjustment (lock + write in one transaction)
-- Apply this on the EXTERNAL Supabase project (where the `balance` table lives).
--
-- Eliminates the read-modify-write race condition in src/lib/balance.ts where
-- two concurrent payments could each read the same value and overwrite each
-- other, causing balance divergence.
--
-- The function locks the row FOR UPDATE (or creates it) and applies the
-- delta server-side, then returns the new totals.

create or replace function public.adjust_balance_atomic(
  p_user_id uuid,
  p_account_delta numeric default 0,
  p_cash_delta numeric default 0
)
returns table(account_amount numeric, cash_amount numeric, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account numeric;
  v_cash numeric;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Lock the row if it exists.
  select b.account_amount, b.cash_amount
    into v_account, v_cash
    from public.balance b
   where b.user_id = p_user_id
   for update;

  if not found then
    insert into public.balance (user_id, account_amount, cash_amount, amount, updated_at)
    values (
      p_user_id,
      greatest(0, coalesce(p_account_delta, 0)),
      greatest(0, coalesce(p_cash_delta, 0)),
      greatest(0, coalesce(p_account_delta, 0) + coalesce(p_cash_delta, 0)),
      now()
    )
    returning balance.account_amount, balance.cash_amount, balance.amount
      into v_account, v_cash, amount;
    account_amount := v_account;
    cash_amount := v_cash;
    return next;
    return;
  end if;

  v_account := round((coalesce(v_account, 0) + coalesce(p_account_delta, 0))::numeric, 2);
  v_cash := round((coalesce(v_cash, 0) + coalesce(p_cash_delta, 0))::numeric, 2);

  update public.balance
     set account_amount = v_account,
         cash_amount = v_cash,
         amount = round((v_account + v_cash)::numeric, 2),
         updated_at = now()
   where user_id = p_user_id;

  account_amount := v_account;
  cash_amount := v_cash;
  amount := round((v_account + v_cash)::numeric, 2);
  return next;
end;
$$;

grant execute on function public.adjust_balance_atomic(uuid, numeric, numeric) to authenticated, service_role;

-- ==============================================================
-- 2) atomic_loan_payment
-- ==============================================================
-- Step 5.1 (cont.) — Atomic loan payment registration.
-- Apply on the EXTERNAL Supabase project.
--
-- Locks the loan row FOR UPDATE, performs an optimistic-concurrency check
-- against `paid_installments`, then inserts the payment and updates loan
-- stats in a single transaction. Eliminates the partial-write window where
-- the payment row inserts but the loan update fails (or vice-versa) and
-- prevents two concurrent installments from both incrementing from the
-- same baseline.

create or replace function public.register_loan_payment_atomic(
  p_loan_id uuid,
  p_user_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_installment_number int,
  p_payment_method_id uuid,
  p_metadata jsonb,
  p_expected_paid_installments int,
  p_new_paid_installments int,
  p_new_status text,
  p_new_remaining_amount numeric,
  p_new_due_date date
)
returns table(payment_id uuid, loan_id uuid, paid_installments int, status text, remaining_amount numeric, due_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_paid int;
begin
  if p_loan_id is null or p_user_id is null or p_payment_id is null then
    raise exception 'loan_id, user_id and payment_id are required';
  end if;

  -- Lock the loan row to serialize concurrent payments on the same contract.
  select l.paid_installments
    into v_current_paid
    from public.loans l
   where l.id = p_loan_id
   for update;

  if not found then
    raise exception 'loan % not found', p_loan_id;
  end if;

  -- Optimistic concurrency: bail out if another transaction moved the loan.
  if v_current_paid is distinct from p_expected_paid_installments then
    raise exception 'loan % was modified concurrently (expected paid_installments=%, got %)',
      p_loan_id, p_expected_paid_installments, v_current_paid
      using errcode = '40001';
  end if;

  insert into public.payments (
    id, user_id, loan_id, amount, date, installment_number, payment_method_id, metadata
  ) values (
    p_payment_id, p_user_id, p_loan_id, p_amount, p_payment_date,
    p_installment_number, p_payment_method_id, p_metadata
  );

  update public.loans
     set paid_installments = p_new_paid_installments,
         status = p_new_status,
         remaining_amount = p_new_remaining_amount,
         due_date = p_new_due_date
   where id = p_loan_id;

  payment_id := p_payment_id;
  loan_id := p_loan_id;
  paid_installments := p_new_paid_installments;
  status := p_new_status;
  remaining_amount := p_new_remaining_amount;
  due_date := p_new_due_date;
  return next;
end;
$$;

grant execute on function public.register_loan_payment_atomic(
  uuid, uuid, uuid, numeric, date, int, uuid, jsonb, int, int, text, numeric, date
) to authenticated, service_role;

-- ==============================================================
-- 3) atomic_stock_decrement
-- ==============================================================
-- Step 5.4 — Atomic stock decrement (locks product row, prevents oversell).
-- Apply on the EXTERNAL Supabase project.
--
-- Eliminates the race where two concurrent sales each read `stock=1`, both
-- compute `newStock=max(0, 1-1)=0`, and both succeed — selling the same unit
-- twice. The function locks the products row FOR UPDATE, validates that
-- `stock >= qty`, decrements, and inserts the stock_movements row in a
-- single transaction.

create or replace function public.decrement_stock_atomic(
  p_product_id uuid,
  p_owner_id uuid,
  p_user_id uuid,
  p_quantity int,
  p_sale_id uuid default null,
  p_notes text default null,
  p_total_value numeric default null
)
returns table(product_id uuid, new_stock int, movement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
  v_name text;
  v_new_stock int;
  v_movement_id uuid;
begin
  if p_product_id is null or p_owner_id is null or p_user_id is null then
    raise exception 'product_id, owner_id and user_id are required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be > 0';
  end if;

  select p.stock, p.name
    into v_stock, v_name
    from public.products p
   where p.id = p_product_id
   for update;

  if not found then
    raise exception 'product % not found', p_product_id;
  end if;

  if coalesce(v_stock, 0) < p_quantity then
    raise exception 'insufficient stock for % (available: %, requested: %)',
      v_name, coalesce(v_stock, 0), p_quantity
      using errcode = 'P0001';
  end if;

  v_new_stock := v_stock - p_quantity;

  update public.products
     set stock = v_new_stock
   where id = p_product_id;

  insert into public.stock_movements (
    owner_id, user_id, product_id, product_name,
    movement_type, quantity, total_value, sale_id, notes
  ) values (
    p_owner_id, p_user_id, p_product_id, v_name,
    'venda', -p_quantity, p_total_value, p_sale_id, p_notes
  )
  returning id into v_movement_id;

  product_id := p_product_id;
  new_stock := v_new_stock;
  movement_id := v_movement_id;
  return next;
end;
$$;

grant execute on function public.decrement_stock_atomic(
  uuid, uuid, uuid, int, uuid, text, numeric
) to authenticated, service_role;

-- ==============================================================
-- 4) complete_financial_rls
-- ==============================================================
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
  owner_col text;
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

    -- detect owner column (user_id preferred, else owner_id)
    select column_name into owner_col
      from information_schema.columns
     where table_schema='public' and table_name=tbl
       and column_name in ('user_id','owner_id')
     order by case column_name when 'user_id' then 1 else 2 end
     limit 1;

    if owner_col is null then
      raise notice 'skipping % (no user_id/owner_id column)', tbl;
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
        %I = auth.uid()
        or %I = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl, owner_col, owner_col);

    execute format('drop policy if exists "%s_insert_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_insert_owner" on public.%I
      for insert to authenticated
      with check (
        %I = auth.uid()
        or %I = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl, owner_col, owner_col);

    execute format('drop policy if exists "%s_update_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_update_owner" on public.%I
      for update to authenticated
      using (
        %I = auth.uid()
        or %I = public.get_data_owner_id(auth.uid())
      )
      with check (
        %I = auth.uid()
        or %I = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl, owner_col, owner_col, owner_col, owner_col);

    execute format('drop policy if exists "%s_delete_owner" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_delete_owner" on public.%I
      for delete to authenticated
      using (
        %I = auth.uid()
        or %I = public.get_data_owner_id(auth.uid())
      )
    $f$, tbl, tbl, owner_col, owner_col);
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
