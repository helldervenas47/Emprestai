-- =============================================================
-- Seed de teste: cliente "Silas Pires", 1 empréstimo parcelado e 1 produto.
-- Execute no SQL Editor do Supabase EXTERNO.
--
-- COMO USAR:
--   1) Edite a linha `v_email` abaixo com o email da sua conta de teste
--      (a conta que você usa para logar no app).
--   2) Rode o script todo. Idempotente: pode rodar várias vezes.
--   3) Faça login no app — verá o cliente, o empréstimo e o produto.
-- =============================================================

do $$
declare
  v_email text := 'TROQUE_AQUI@exemplo.com';   -- <<< EDITE
  v_user_id uuid;
  v_owner_id uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_product_id uuid;
begin
  -- 1) resolve user_id a partir do email
  select id into v_user_id from auth.users where email = v_email limit 1;
  if v_user_id is null then
    raise exception 'Usuário com email % não encontrado em auth.users. Faça signup primeiro.', v_email;
  end if;
  v_owner_id := public.get_data_owner_id(v_user_id);

  raise notice 'user_id=%, owner_id=%', v_user_id, v_owner_id;

  -- 2) cliente Silas Pires (idempotente por nome+owner)
  select id into v_client_id
    from public.clients
   where name = 'Silas Pires' and user_id = v_owner_id
   limit 1;

  if v_client_id is null then
    v_client_id := gen_random_uuid();
    insert into public.clients (id, user_id, name, phone, document, created_at)
    values (v_client_id, v_owner_id, 'Silas Pires', '11999990000', '000.000.000-00', now());
  end if;

  -- 3) empréstimo parcelado de R$ 1.000 em 5x (idempotente por borrower+amount)
  select id into v_loan_id
    from public.loans
   where borrower_id = v_client_id and amount = 1000 and user_id = v_owner_id
   limit 1;

  if v_loan_id is null then
    v_loan_id := gen_random_uuid();
    insert into public.loans (
      id, user_id, borrower_name, borrower_id, amount, interest_rate,
      interest_type, payment_type, start_date, due_date, original_due_date,
      installments, paid_installments, status, remaining_amount, created_at
    ) values (
      v_loan_id, v_owner_id, 'Silas Pires', v_client_id, 1000, 10,
      'Mensal', 'Parcelado', current_date, current_date + interval '30 days', current_date + interval '30 days',
      5, 0, 'ativo', 1100, now()
    );
  end if;

  -- 4) produto de teste para venda
  select id into v_product_id
    from public.products
   where name = 'Produto Teste Silas' and user_id = v_owner_id
   limit 1;

  if v_product_id is null then
    v_product_id := gen_random_uuid();
    insert into public.products (id, user_id, owner_id, name, price, cost_price, stock, created_at)
    values (v_product_id, v_owner_id, v_owner_id, 'Produto Teste Silas', 50, 30, 100, now());
  end if;

  raise notice 'SEED OK — client_id=%  loan_id=%  product_id=%',
    v_client_id, v_loan_id, v_product_id;
end$$;

-- Conferência rápida
select 'clients' as t, id, name from public.clients where name = 'Silas Pires'
union all
select 'loans', id, borrower_name from public.loans where borrower_name = 'Silas Pires'
union all
select 'products', id, name from public.products where name = 'Produto Teste Silas';
