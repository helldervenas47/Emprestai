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
