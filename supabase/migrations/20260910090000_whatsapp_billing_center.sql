-- Central de Cobranças: fila durável, promessas de pagamento e RLS.
create table if not exists public.whatsapp_payment_promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  promised_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, loan_id, installment_number)
);

create table if not exists public.whatsapp_billing_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  phone text not null,
  message text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled','paused')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  error_message text,
  attempts integer not null default 0,
  force_resend boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_billing_queue_due_idx
  on public.whatsapp_billing_queue(status, scheduled_at);
create index if not exists whatsapp_billing_queue_user_created_idx
  on public.whatsapp_billing_queue(user_id, created_at desc);
create unique index if not exists whatsapp_billing_queue_daily_idempotency_idx
  on public.whatsapp_billing_queue(user_id, loan_id, installment_number, ((created_at at time zone 'America/Sao_Paulo')::date))
  where force_resend = false and status <> 'cancelled';

alter table public.whatsapp_payment_promises enable row level security;
alter table public.whatsapp_billing_queue enable row level security;

create policy "billing promises are isolated by owner" on public.whatsapp_payment_promises
  for all to authenticated using (user_id = public.get_data_owner_id(auth.uid())) with check (user_id = public.get_data_owner_id(auth.uid()));
create policy "billing queue is isolated by owner" on public.whatsapp_billing_queue
  for select to authenticated using (user_id = public.get_data_owner_id(auth.uid()));
create policy "users can enqueue owned billings" on public.whatsapp_billing_queue
  for insert to authenticated with check (
    user_id = public.get_data_owner_id(auth.uid())
    and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = public.get_data_owner_id(auth.uid()))
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = public.get_data_owner_id(auth.uid()))
  );
create policy "users can pause or cancel owned billings" on public.whatsapp_billing_queue
  for update to authenticated using (user_id = public.get_data_owner_id(auth.uid())) with check (user_id = public.get_data_owner_id(auth.uid()));

grant select, insert, update on public.whatsapp_billing_queue to authenticated;
grant select, insert, update, delete on public.whatsapp_payment_promises to authenticated;
grant all on public.whatsapp_billing_queue, public.whatsapp_payment_promises to service_role;

create or replace function public.protect_whatsapp_queue_identity()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id
    or new.client_id is distinct from old.client_id
    or new.loan_id is distinct from old.loan_id
    or new.installment_number is distinct from old.installment_number
    or new.phone is distinct from old.phone
    or new.message is distinct from old.message
    or new.amount is distinct from old.amount
    or new.due_date is distinct from old.due_date then
    raise exception 'Campos de identidade da cobrança são imutáveis';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_whatsapp_queue_identity on public.whatsapp_billing_queue;
create trigger protect_whatsapp_queue_identity before update on public.whatsapp_billing_queue
for each row execute function public.protect_whatsapp_queue_identity();

-- Reserva atômica: somente um worker pode processar um item.
create or replace function public.claim_whatsapp_billing_queue_item()
returns setof public.whatsapp_billing_queue
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.whatsapp_billing_queue q
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where q.id = (
    select id from public.whatsapp_billing_queue
    where status = 'pending' and scheduled_at <= now()
    order by scheduled_at for update skip locked limit 1
  )
  returning q.*;
end;
$$;
revoke all on function public.claim_whatsapp_billing_queue_item() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_billing_queue_item() to service_role;
