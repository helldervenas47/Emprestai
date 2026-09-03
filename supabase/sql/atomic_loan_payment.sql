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
