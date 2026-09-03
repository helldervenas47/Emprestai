-- ============================================================================
-- ETAPA FINAL — RPC FINANCEIRA V3: SNAPSHOT, BACKFILL DE CACHE E ROLLBACK
-- ============================================================================
-- O QUE ESTE SCRIPT FAZ
--   1. cria/ajusta a tabela de snapshot `rpc_v3_migration_snapshots` (append-only);
--   2. cria `public.rpc_v3_backfill_cache(...)` que atualiza SOMENTE
--      `loans.remaining_amount` e `loans.paid_installments`;
--   3. cria `public.rpc_v3_rollback_batch(batch_id)` que restaura o snapshot.
--
-- O QUE ESTE SCRIPT NUNCA FAZ
--   * não altera `payments`, `loan_installments`, `principal_amount`,
--     `interest_amount`, `allocation_version` nem qualquer histórico;
--   * não recalcula pagamentos antigos;
--   * não cria metadata retroativa.
--
-- IDEMPOTÊNCIA: 100% reaplicável. Usa `create table if not exists`,
-- `add column if not exists`, `drop policy if exists`, `create index if not
-- exists` e `drop function if exists` das assinaturas antigas antes do
-- `create or replace`. Nenhum dado existente é apagado.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tabela de auditoria (append-only)
-- ----------------------------------------------------------------------------
create table if not exists public.rpc_v3_migration_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  migration_version text not null default 'rpc_financial_v3_final',
  loan_id uuid not null,
  user_id uuid not null,
  old_remaining_amount numeric,
  new_remaining_amount numeric not null,
  old_paid_installments integer,
  new_paid_installments integer not null,
  status text not null default 'APPLIED',
  executed_by uuid default auth.uid(),
  executed_at timestamptz not null default now()
);

-- Instalações anteriores podem não ter todas as colunas/estados.
alter table public.rpc_v3_migration_snapshots
  add column if not exists migration_version text not null default 'rpc_financial_v3_final',
  add column if not exists old_remaining_amount numeric,
  add column if not exists old_paid_installments integer,
  add column if not exists executed_by uuid,
  add column if not exists executed_at timestamptz not null default now();

do $$
begin
  alter table public.rpc_v3_migration_snapshots
    drop constraint if exists rpc_v3_migration_snapshots_status_check;
  alter table public.rpc_v3_migration_snapshots
    add constraint rpc_v3_migration_snapshots_status_check
    check (status in ('PLANNED','APPLIED','SKIPPED','BLOCKED','BLOCKED_BY_RLS','STALE','ROLLED_BACK'));
end $$;

create index if not exists idx_rpcv3_snap_batch on public.rpc_v3_migration_snapshots (batch_id);
create index if not exists idx_rpcv3_snap_loan on public.rpc_v3_migration_snapshots (loan_id);
create index if not exists idx_rpcv3_snap_batch_status on public.rpc_v3_migration_snapshots (batch_id, status);

grant select, insert on public.rpc_v3_migration_snapshots to authenticated;
grant all on public.rpc_v3_migration_snapshots to service_role;

alter table public.rpc_v3_migration_snapshots enable row level security;

drop policy if exists "rpcv3 snapshot select" on public.rpc_v3_migration_snapshots;
create policy "rpcv3 snapshot select"
  on public.rpc_v3_migration_snapshots
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "rpcv3 snapshot insert" on public.rpc_v3_migration_snapshots;
create policy "rpcv3 snapshot insert"
  on public.rpc_v3_migration_snapshots
  for insert to authenticated
  -- O snapshot guarda o user_id DONO do contrato. Um administrador executando o
  -- backfill de outro usuário precisa poder gravar a trilha de auditoria, senão
  -- a função inteira falha por RLS e nenhuma escrita é auditada.
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Trilha append-only: ninguém altera ou apaga auditoria pelo Data API.
revoke update, delete on public.rpc_v3_migration_snapshots from authenticated;

-- ----------------------------------------------------------------------------
-- 2. BACKFILL — somente caches, sempre com snapshot ANTES/JUNTO da escrita
-- payload: [{ "loan_id": uuid, "remaining_amount": numeric, "paid_installments": int,
--            "expected_remaining_amount": numeric|null, "expected_paid_installments": int|null }, ...]
--
-- OPTIMISTIC LOCKING: quando `expected_*` é informado, o contrato só é
-- atualizado se o valor atual no banco ainda for exatamente o valor observado
-- no diagnóstico. Caso contrário vira 'STALE' e NÃO é sobrescrito.
--
-- INTEGRIDADE DE AUDITORIA: o status 'APPLIED' só é gravado quando o UPDATE
-- realmente afetou a linha. Se a RLS de `loans` bloquear a escrita, o registro
-- é gravado como 'BLOCKED_BY_RLS' (nunca como aplicado).
-- ----------------------------------------------------------------------------
drop function if exists public.rpc_v3_backfill_cache(text, jsonb);
drop function if exists public.rpc_v3_backfill_cache(text, jsonb, uuid[]);
drop function if exists public.rpc_v3_backfill_cache(text, jsonb, uuid[], boolean);
drop function if exists public.rpc_v3_backfill_cache(text, jsonb, uuid[], uuid[], boolean);

create or replace function public.rpc_v3_backfill_cache(
  p_batch_id text,
  p_payload jsonb,
  p_blocked_loan_ids uuid[] default '{}',
  p_blocked_user_ids uuid[] default '{}',
  p_dry_run boolean default true
)
returns table (loan_id uuid, status text, old_remaining numeric, new_remaining numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'usuário não autenticado';
  end if;

  -- ==========================================================================
  -- ETAPA 2 — GUARDA PREVENTIVA (MODO SEGURO NO BANCO)
  -- --------------------------------------------------------------------------
  -- `public.loans.remaining_amount` e `public.loans.paid_installments` são o
  -- ESTADO CONSOLIDADO OFICIAL. Reconstruí-los em massa a partir do histórico
  -- legado é proibido: a alocação de pagamentos antigos não é determinística.
  --
  -- A função permanece disponível SOMENTE em modo simulação (`p_dry_run = true`),
  -- que apenas lê e registra linhas PLANNED na trilha de auditoria.
  -- Reabilitar a escrita exige mudança explícita deste bloco + nova auditoria.
  -- ==========================================================================
  if not p_dry_run then
    raise exception using
      errcode = 'raise_exception',
      message = 'rpc_v3_backfill_cache: escrita bloqueada (modo seguro)',
      detail  = 'remaining_amount e paid_installments são o estado consolidado oficial e não podem ser reconstruídos a partir do histórico legado.',
      hint    = 'Execute somente com p_dry_run = true. A liberação exige alteração explícita da função e nova auditoria.';
  end if;



  -- Serializa o lote contra pagamentos/backfills concorrentes. O lock é tomado
  -- em ordem crescente e determinística de loan_id (evita deadlock entre dois
  -- administradores processando lotes que compartilham contratos).
  if not p_dry_run then
    for v_id in
      select distinct (e->>'loan_id')::uuid
      from jsonb_array_elements(coalesce(p_payload, '[]'::jsonb)) e
      order by 1
    loop
      perform 1 from public.loans l where l.id = v_id for update;
    end loop;
  end if;

  return query
  with entrada as (
    select distinct on ((e->>'loan_id')::uuid)
           (e->>'loan_id')::uuid as loan_id,
           round((e->>'remaining_amount')::numeric, 2) as remaining_amount,
           (e->>'paid_installments')::int as paid_installments,
           case when (e ? 'expected_remaining_amount') and e->>'expected_remaining_amount' is not null
                then round((e->>'expected_remaining_amount')::numeric, 2) end as expected_remaining,
           case when (e ? 'expected_paid_installments') and e->>'expected_paid_installments' is not null
                then (e->>'expected_paid_installments')::int end as expected_paid
    from jsonb_array_elements(coalesce(p_payload, '[]'::jsonb)) e
  ),
  alvo as (
    select l.id,
           l.user_id,
           l.remaining_amount as old_remaining,
           l.paid_installments as old_paid,
           en.remaining_amount as new_remaining,
           en.paid_installments as new_paid,
           case
             when en.loan_id = any (coalesce(p_blocked_loan_ids, '{}')) then 'BLOCKED'
             when l.user_id = any (coalesce(p_blocked_user_ids, '{}')) then 'BLOCKED'
             when l.user_id <> v_user and not public.has_role(v_user, 'admin') then 'BLOCKED'
             when coalesce(l.remaining_amount, -1) = en.remaining_amount
              and coalesce(l.paid_installments, -1) = en.paid_installments then 'SKIPPED'
             when en.expected_remaining is not null
              and round(coalesce(l.remaining_amount, -1), 2) <> en.expected_remaining then 'STALE'
             when en.expected_paid is not null
              and coalesce(l.paid_installments, -1) <> en.expected_paid then 'STALE'
             else 'APPLIED'
           end as decisao
    from entrada en
    join public.loans l on l.id = en.loan_id
  ),
  aplicado as (
    update public.loans l
    set remaining_amount = a.new_remaining,
        paid_installments = a.new_paid
    from alvo a
    where l.id = a.id
      and a.decisao = 'APPLIED'
      and not p_dry_run
      -- guarda pessimista adicional: o valor não pode ter mudado entre a
      -- leitura de `alvo` e a escrita (defesa em profundidade).
      and coalesce(l.remaining_amount, -1) = coalesce(a.old_remaining, -1)
      and coalesce(l.paid_installments, -1) = coalesce(a.old_paid, -1)
    returning l.id
  ),
  resultado as (
    select a.*,
           case
             when p_dry_run then 'PLANNED'
             when a.decisao <> 'APPLIED' then a.decisao
             when a.id in (select id from aplicado) then 'APPLIED'
             else 'BLOCKED_BY_RLS'
           end as status_final
    from alvo a
  ),
  snap as (
    insert into public.rpc_v3_migration_snapshots (
      batch_id, loan_id, user_id, old_remaining_amount, new_remaining_amount,
      old_paid_installments, new_paid_installments, status, executed_by
    )
    select p_batch_id, r.id, r.user_id, r.old_remaining, r.new_remaining,
           r.old_paid, r.new_paid, r.status_final, v_user
    from resultado r
    returning loan_id
  )
  select r.id, r.status_final, r.old_remaining, r.new_remaining
  from resultado r
  where (select count(*) from snap) >= 0;
end;
$$;

-- ETAPA 4: nenhuma execução direta pelo cliente. Somente backend controlado.
revoke all on function public.rpc_v3_backfill_cache(text, jsonb, uuid[], uuid[], boolean) from public, anon, authenticated;
grant execute on function public.rpc_v3_backfill_cache(text, jsonb, uuid[], uuid[], boolean) to service_role;

-- ----------------------------------------------------------------------------
-- 2b. VALIDAÇÃO PREVENTIVA (ETAPA 4 — FASE 4.6 / 4.7)
-- ----------------------------------------------------------------------------
-- Retorno SANITIZADO: apenas `loan_id`, `allowed` e `blocking_reasons`.
-- NUNCA retorna borrower_name, saldo, parcelas, valores ou datas.
-- Defesa em profundidade: exige sessão autenticada e escopo do próprio
-- usuário (ou admin de aplicação). Resposta uniforme para qualquer contrato
-- inacessível/inexistente, impedindo enumeração.
drop function if exists public.rpc_v3_validate_backfill_payload(jsonb);

create or replace function public.rpc_v3_validate_backfill_payload(p_payload jsonb)
returns table (loan_id uuid, allowed boolean, blocking_reasons text[])
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- FASE 4.7 — autorização no corpo, mensagem externa uniforme.
  if v_user is null then
    raise exception 'acesso não autorizado' using errcode = '42501';
  end if;

  return query
  with alvo as (
    select distinct (e->>'loan_id')::uuid as id
    from jsonb_array_elements(coalesce(p_payload, '[]'::jsonb)) e
  ),
  visivel as (
    -- SECURITY INVOKER + RLS de `loans` já restringem, mas a checagem explícita
    -- garante o mesmo resultado caso alguém reintroduza SECURITY DEFINER.
    select a.id,
           l.id is not null as existe,
           l.remaining_amount,
           l.paid_installments,
           l.status
    from alvo a
    left join public.loans l
      on l.id = a.id
     and (l.user_id = v_user or public.has_role(v_user, 'admin'))
  ),
  agg as (
    select v.id,
           v.existe,
           v.remaining_amount,
           v.paid_installments,
           v.status,
           count(p.id) filter (
             where p.metadata is null or not (p.metadata ? 'allocation_version')
           ) as legacy_payments,
           count(p.id) filter (
             where p.metadata ? 'principal_amount'
               and abs(
                 coalesce((p.metadata->>'principal_amount')::numeric, 0)
                 + coalesce((p.metadata->>'interest_amount')::numeric, 0)
                 + coalesce((p.metadata->>'penalty_amount')::numeric, 0)
                 + coalesce((p.metadata->>'late_interest_amount')::numeric, 0)
                 - p.amount
               ) > 0.01
           ) as invalid_allocations
    from visivel v
    left join public.payments p on v.existe and p.loan_id = v.id
    group by v.id, v.existe, v.remaining_amount, v.paid_installments, v.status
  )
  select g.id,
         false as allowed,  -- modo seguro: nunca liberado por esta função
         case
           -- Resposta UNIFORME: contrato inexistente e contrato de outro dono
           -- produzem exatamente o mesmo motivo (sem enumeração).
           when not g.existe then array['modo seguro ativo: escrita bloqueada']
           else array_remove(array[
             'modo seguro ativo: escrita bloqueada',
             case when g.legacy_payments > 0
                  then 'pagamentos legados sem allocation_version' end,
             case when g.invalid_allocations > 0
                  then 'alocação persistida inválida' end,
             case when g.status = 'renegotiated' then 'contrato renegociado' end,
             case when g.remaining_amount is null or g.paid_installments is null
                  then 'estado consolidado oficial ausente' end,
             case when (p_payload @> jsonb_build_array(jsonb_build_object('loan_id', g.id)))
                   and exists (
                     select 1
                     from jsonb_array_elements(coalesce(p_payload, '[]'::jsonb)) e
                     where (e->>'loan_id')::uuid = g.id
                       and (
                         (e ? 'expected_remaining_amount'
                          and e->>'expected_remaining_amount' is not null
                          and round((e->>'expected_remaining_amount')::numeric, 2)
                              is distinct from round(coalesce(g.remaining_amount, -1), 2))
                         or (e ? 'expected_paid_installments'
                          and e->>'expected_paid_installments' is not null
                          and (e->>'expected_paid_installments')::int
                              is distinct from coalesce(g.paid_installments, -1))
                       )
                   )
                  then 'PAYLOAD_STALE' end
           ], null)
         end
  from agg g;
end;
$$;

-- ETAPA 4: sem execução para anon/PUBLIC. `authenticated` mantém acesso apenas
-- ao validador SANITIZADO (retorno sem qualquer dado financeiro, allowed=false
-- incondicional, escopo do próprio usuário).
revoke all on function public.rpc_v3_validate_backfill_payload(jsonb) from public, anon;
grant execute on function public.rpc_v3_validate_backfill_payload(jsonb) to authenticated;
grant execute on function public.rpc_v3_validate_backfill_payload(jsonb) to service_role;


-- ----------------------------------------------------------------------------
-- 3. ROLLBACK — restaura o snapshot apenas onde o valor atual ainda é o aplicado
-- ----------------------------------------------------------------------------
create or replace function public.rpc_v3_rollback_batch(p_batch_id text)
returns table (loan_id uuid, restored boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.has_role(v_user, 'admin') then
    raise exception 'acesso não autorizado' using errcode = '42501';
  end if;

  -- Mesmo lock determinístico do backfill.
  for v_id in
    select distinct s.loan_id
    from public.rpc_v3_migration_snapshots s
    where s.batch_id = p_batch_id and s.status = 'APPLIED'
    order by 1
  loop
    perform 1 from public.loans l where l.id = v_id for update;
  end loop;

  return query
  with snap as (
    select distinct on (s.loan_id)
           s.loan_id, s.user_id, s.old_remaining_amount, s.old_paid_installments,
           s.new_remaining_amount, s.new_paid_installments
    from public.rpc_v3_migration_snapshots s
    where s.batch_id = p_batch_id
      and s.status = 'APPLIED'
      -- rollback duplicado é no-op: ignora contratos já revertidos neste lote
      and not exists (
        select 1 from public.rpc_v3_migration_snapshots r
        where r.batch_id = s.batch_id and r.loan_id = s.loan_id and r.status = 'ROLLED_BACK'
      )
    order by s.loan_id, s.executed_at desc
  ),
  revertido as (
    update public.loans l
    set remaining_amount = s.old_remaining_amount,
        paid_installments = s.old_paid_installments
    from snap s
    where l.id = s.loan_id
      and (l.user_id = v_user or public.has_role(v_user, 'admin'))
      -- nunca sobrescreve alteração financeira posterior ao backfill
      and coalesce(l.remaining_amount, -1) = coalesce(s.new_remaining_amount, -1)
      and coalesce(l.paid_installments, -1) = coalesce(s.new_paid_installments, -1)
    returning l.id
  ),
  registro as (
    insert into public.rpc_v3_migration_snapshots (
      batch_id, loan_id, user_id, old_remaining_amount, new_remaining_amount,
      old_paid_installments, new_paid_installments, status, executed_by
    )
    select p_batch_id, s.loan_id, s.user_id, s.new_remaining_amount, coalesce(s.old_remaining_amount, 0),
           s.new_paid_installments, coalesce(s.old_paid_installments, 0), 'ROLLED_BACK', v_user
    from snap s
    where s.loan_id in (select id from revertido)
    returning loan_id
  )
  select s.loan_id, s.loan_id in (select loan_id from registro)
  from snap s;
end;
$$;

-- ETAPA 4.9: rota de ESCRITA. Sem execução para anon/authenticated/PUBLIC.
revoke all on function public.rpc_v3_rollback_batch(text) from public, anon, authenticated;
grant execute on function public.rpc_v3_rollback_batch(text) to service_role;

commit;
