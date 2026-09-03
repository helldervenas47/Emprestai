-- ============================================================================
-- Etapa final da centralização transacional dos pagamentos de empréstimo.
--
-- Adiciona a RPC `register_loan_interest_payment_atomic`, usada pelos fluxos
-- que ainda inseriam diretamente em `public.payments` no frontend:
--   * pagamento somente de juros (installment_number = 0);
--   * multa / juros de atraso avulsos (installment_number = -2);
--   * multa consolidada ao pagamento de juros (metadata.consolidated_with).
--
-- Abordagem B do plano: RPC específica, reutilizando um único helper de ledger
-- (`public.loan_payment_ledger_write`) para não duplicar lógica financeira.
--
-- Garantias:
--   * tudo em UMA transação (pagamento principal + multa + contrato +
--     cronograma + extrato);
--   * `FOR UPDATE` no contrato (serializa pagamentos concorrentes);
--   * idempotência por `payment_id` / `late_fee_payment_id` (replay devolve
--     sucesso; mesmos IDs com dados diferentes geram conflito);
--   * multa consolidada NÃO gera ledger próprio — o ledger do pagamento
--     principal já contém principal/juros + multa;
--   * pagamentos divididos preservam UMA linha de ledger por parte.
--
-- Aplicar no projeto Supabase EXTERNO.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper único de escrita no extrato (idempotente).
-- `p_rows` é um array jsonb: [{ amount, payment_method_id, metadata }]
-- Cada elemento vira UMA linha de `public.account_ledger`.
-- ----------------------------------------------------------------------------
create or replace function public.loan_payment_ledger_write(
  p_user_id uuid,
  p_loan_id uuid,
  p_payment_id uuid,
  p_occurred_on text,
  p_description text,
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_amount numeric;
  v_method uuid;
  v_wallet text;
  v_written int := 0;
  v_exists boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_amount := round(coalesce((v_row ->> 'amount')::numeric, 0), 2);
    if v_amount <= 0 then
      continue;
    end if;
    v_method := nullif(btrim(coalesce(v_row ->> 'payment_method_id', '')), '')::uuid;

    select case when pm.kind = 'cash' then 'cash' else 'account' end
      into v_wallet
      from public.payment_methods pm
     where pm.id = v_method;
    v_wallet := coalesce(v_wallet, 'account');

    -- Idempotência: não recria a mesma linha (payment_id + método + valor).
    select exists (
      select 1
        from public.account_ledger al
       where al.payment_id = p_payment_id
         and al.user_id = p_user_id
         and al.category = 'payment'
         and al.payment_method_id is not distinct from v_method
         and round(al.amount, 2) = v_amount
    ) into v_exists;

    if v_exists then
      continue;
    end if;

    insert into public.account_ledger (
      user_id, direction, category, amount, occurred_on, description,
      loan_id, payment_id, source, metadata, wallet, payment_method_id
    ) values (
      p_user_id, 'in', 'payment', v_amount, p_occurred_on::date, p_description,
      p_loan_id, p_payment_id, 'auto',
      coalesce(v_row -> 'metadata', '{}'::jsonb), v_wallet, v_method
    );
    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function public.loan_payment_ledger_write(uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.loan_payment_ledger_write(uuid, uuid, uuid, text, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- RPC transacional: juros / multa (com multa consolidada opcional).
-- ----------------------------------------------------------------------------
create or replace function public.register_loan_interest_payment_atomic(
  p_user_id uuid,
  p_loan_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date text,
  p_installment_number int,
  p_previous_due_date text,
  p_payment_method_id uuid,
  p_metadata jsonb,
  p_ledger_description text,
  p_ledger_rows jsonb,
  p_loan_update jsonb default '{}'::jsonb,
  p_schedule_installment_number int default null,
  p_schedule_due_date text default null,
  p_late_fee_payment_id uuid default null,
  p_late_fee_amount numeric default null,
  p_late_fee_metadata jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_existing record;
  v_existing_fee record;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_fee_amount numeric := round(coalesce(p_late_fee_amount, 0), 2);
  v_ledger_total numeric;
  v_replayed boolean := false;
begin
  if p_user_id is null or p_loan_id is null or p_payment_id is null then
    raise exception 'user_id, loan_id and payment_id are required';
  end if;
  if v_amount < 0 or v_fee_amount < 0 then
    raise exception 'payment amounts must not be negative';
  end if;
  if p_late_fee_payment_id is not null and v_fee_amount <= 0 then
    raise exception 'late_fee_payment_id requires a positive late_fee_amount';
  end if;

  -- Serializa operações concorrentes no mesmo contrato e valida propriedade.
  select l.* into v_loan
    from public.loans l
   where l.id = p_loan_id
   for update;

  if not found then
    raise exception 'loan % not found', p_loan_id;
  end if;
  if v_loan.user_id is distinct from p_user_id then
    raise exception 'loan % does not belong to user %', p_loan_id, p_user_id
      using errcode = '42501';
  end if;

  -- Segurança: chamador autenticado só pode gravar para si mesmo ou para o
  -- owner ao qual está vinculado (`public.user_owner`).
  if auth.uid() is not null
     and auth.uid() is distinct from p_user_id
     and not exists (
       select 1 from public.user_owner uo
        where uo.user_id = auth.uid()
          and uo.owner_id = p_user_id
     )
  then
    raise exception 'not allowed to register payments for user %', p_user_id
      using errcode = '42501';
  end if;


  -- ── Idempotência do pagamento principal ────────────────────────────────
  select p.* into v_existing
    from public.payments p
   where p.id = p_payment_id;

  if found then
    v_replayed := true;
    if v_existing.user_id is distinct from p_user_id
       or v_existing.loan_id is distinct from p_loan_id
       or round(v_existing.amount, 2) is distinct from v_amount
       or v_existing.date::text is distinct from p_payment_date
       or v_existing.installment_number is distinct from p_installment_number
       or v_existing.payment_method_id is distinct from p_payment_method_id
    then
      raise exception 'payment % already exists with different data (idempotency conflict)', p_payment_id
        using errcode = '23505';
    end if;
  else
    insert into public.payments (
      id, user_id, loan_id, amount, date, installment_number,
      previous_due_date, payment_method_id, metadata
    ) values (
      p_payment_id, p_user_id, p_loan_id, v_amount, p_payment_date, p_installment_number,
      p_previous_due_date, p_payment_method_id, coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  -- ── Multa consolidada (mesmo commit do pagamento principal) ────────────
  if p_late_fee_payment_id is not null then
    select p.* into v_existing_fee
      from public.payments p
     where p.id = p_late_fee_payment_id;

    if found then
      if v_existing_fee.user_id is distinct from p_user_id
         or v_existing_fee.loan_id is distinct from p_loan_id
         or round(v_existing_fee.amount, 2) is distinct from v_fee_amount
         or v_existing_fee.date::text is distinct from p_payment_date
         or v_existing_fee.installment_number is distinct from -2
         or nullif(btrim(coalesce(v_existing_fee.metadata ->> 'consolidated_with', '')), '') is distinct from p_payment_id::text
      then
        raise exception 'late fee payment % already exists with different data (idempotency conflict)', p_late_fee_payment_id
          using errcode = '23505';
      end if;
    else
      insert into public.payments (
        id, user_id, loan_id, amount, date, installment_number,
        previous_due_date, payment_method_id, metadata
      ) values (
        p_late_fee_payment_id, p_user_id, p_loan_id, v_fee_amount, p_payment_date, -2,
        p_previous_due_date, p_payment_method_id,
        coalesce(p_late_fee_metadata, '{}'::jsonb)
          || jsonb_build_object('kind', 'late_fee', 'consolidated_with', p_payment_id::text)
      );
    end if;
  end if;

  -- ── Atualização do contrato (somente no primeiro registro) ─────────────
  if not v_replayed and p_loan_update is not null and p_loan_update <> '{}'::jsonb then
    update public.loans l
       set due_date = coalesce(p_loan_update ->> 'due_date', l.due_date),
           remaining_amount = coalesce((p_loan_update ->> 'remaining_amount')::numeric, l.remaining_amount),
           renegotiation_penalty_total = coalesce(
             (p_loan_update ->> 'renegotiation_penalty_total')::numeric,
             l.renegotiation_penalty_total
           )
     where l.id = p_loan_id;
  end if;

  -- ── Cronograma da próxima parcela ──────────────────────────────────────
  if not v_replayed
     and p_schedule_installment_number is not null
     and p_schedule_due_date is not null then
    update public.loan_installments li
       set due_date = p_schedule_due_date
     where li.loan_id = p_loan_id
       and li.installment_number = p_schedule_installment_number;
  end if;

  -- ── Extrato consolidado (uma linha por parte do split) ─────────────────
  perform public.loan_payment_ledger_write(
    p_user_id, p_loan_id, p_payment_id, p_payment_date, p_ledger_description, p_ledger_rows
  );

  select coalesce(sum(al.amount), 0) into v_ledger_total
    from public.account_ledger al
   where al.payment_id = p_payment_id
     and al.user_id = p_user_id
     and al.category = 'payment';

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'late_fee_payment_id', p_late_fee_payment_id,
    'replayed', v_replayed,
    'ledger_total', v_ledger_total
  );
end;
$$;

revoke all on function public.register_loan_interest_payment_atomic(
  uuid, uuid, uuid, numeric, text, int, text, uuid, jsonb, text, jsonb, jsonb, int, text, uuid, numeric, jsonb
) from public, anon;

grant execute on function public.register_loan_interest_payment_atomic(
  uuid, uuid, uuid, numeric, text, int, text, uuid, jsonb, text, jsonb, jsonb, int, text, uuid, numeric, jsonb
) to authenticated, service_role;
