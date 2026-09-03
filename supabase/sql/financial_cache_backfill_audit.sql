-- ============================================================================
-- FASE 4 — AUDITORIA DO BACKFILL DE CACHES FINANCEIROS (NÃO EXECUTADO AINDA)
-- ============================================================================
-- Este script cria APENAS a tabela de auditoria append-only usada pelo backfill
-- controlado de `loans.remaining_amount` e `loans.paid_installments`.
--
-- Ele NÃO atualiza nenhum contrato, pagamento, metadata ou snapshot.
-- A execução deve ocorrer somente após aprovação explícita.
-- ============================================================================

create table if not exists public.financial_cache_backfill_audit (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  loan_id uuid not null,
  user_id uuid not null default auth.uid(),
  calculation_version text not null,
  old_remaining_amount numeric,
  old_paid_installments integer,
  old_updated_at timestamptz,
  new_remaining_amount numeric not null,
  new_paid_installments integer not null,
  status text not null check (status in ('PLANNED','UPDATED','SKIPPED','CONFLICT','FAILED','ROLLED_BACK')),
  error_message text,
  executed_by uuid default auth.uid(),
  executed_at timestamptz not null default now()
);

create index if not exists idx_fcba_batch on public.financial_cache_backfill_audit (batch_id);
create index if not exists idx_fcba_loan on public.financial_cache_backfill_audit (loan_id);
create unique index if not exists uq_fcba_batch_loan_status
  on public.financial_cache_backfill_audit (batch_id, loan_id, status);

grant select, insert on public.financial_cache_backfill_audit to authenticated;
grant all on public.financial_cache_backfill_audit to service_role;

alter table public.financial_cache_backfill_audit enable row level security;

-- Append-only por política: sem UPDATE e sem DELETE para usuários.
drop policy if exists "own audit select" on public.financial_cache_backfill_audit;
create policy "own audit select"
  on public.financial_cache_backfill_audit
  for select
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "own audit insert" on public.financial_cache_backfill_audit;
create policy "own audit insert"
  on public.financial_cache_backfill_audit
  for insert
  to authenticated
  with check (user_id = auth.uid());
