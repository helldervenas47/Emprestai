-- ============================================================================
-- SUÍTE DE VALIDAÇÃO NO SUPABASE — RPC FINANCEIRA V3
-- ============================================================================
-- Execute NESTA ORDEM, no SQL Editor do projeto Supabase, DEPOIS de reaplicar
-- `supabase/sql/rpc_v3_final_migration.sql`.
--
-- ⚠️ Nenhum bloco abaixo altera pagamentos, parcelas, metadata ou histórico.
--    Os blocos marcados [ESCRITA] só tocam `loans.remaining_amount` e
--    `loans.paid_installments` de um contrato de teste criado por você.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. INVENTÁRIO PÓS-MIGRATION — quais objetos existem e com qual assinatura
-- ----------------------------------------------------------------------------
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rpc_v3_backfill_cache', 'rpc_v3_rollback_batch');
-- Esperado: exatamente 1 linha por função, security_definer = false,
--           args do backfill = (text, jsonb, uuid[], uuid[], boolean).

select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.rpc_v3_migration_snapshots'::regclass;
-- Esperado: 2 policies (select/insert), ambas com `has_role(auth.uid(),'admin')`.

select indexname from pg_indexes
where tablename = 'rpc_v3_migration_snapshots';
-- Esperado: pkey + idx_rpcv3_snap_batch + idx_rpcv3_snap_loan + idx_rpcv3_snap_batch_status.

select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'rpc_v3_migration_snapshots';
-- Esperado: authenticated = SELECT/INSERT apenas (sem UPDATE/DELETE).


-- ----------------------------------------------------------------------------
-- 1. IDEMPOTÊNCIA — reaplicar a migration não pode destruir nada
-- ----------------------------------------------------------------------------
select count(*) as snapshots_antes from public.rpc_v3_migration_snapshots;
-- >>> reaplique rpc_v3_final_migration.sql aqui <<<
select count(*) as snapshots_depois from public.rpc_v3_migration_snapshots;
-- Esperado: mesmo número, nenhum erro de "already exists", nenhuma duplicata
--           de policy/função/índice (repita o bloco 0).


-- ----------------------------------------------------------------------------
-- 2. DRY-RUN OBRIGATÓRIO (nenhuma linha de `loans` pode mudar)
-- ----------------------------------------------------------------------------
-- Cole aqui o payload gerado pelo Painel de Migração (botão "SQL de backfill").
-- O painel já emite a chamada com dry_run = true na primeira seção.
--
-- Verificação de imutabilidade em volta do dry-run:
create temp table if not exists _loans_before as
  select id, remaining_amount, paid_installments from public.loans;

-- >>> execute aqui o `select * from public.rpc_v3_backfill_cache(..., true);` <<<

select count(*) as linhas_alteradas_durante_dry_run
from public.loans l
join _loans_before b on b.id = l.id
where coalesce(l.remaining_amount, -1) is distinct from coalesce(b.remaining_amount, -1)
   or coalesce(l.paid_installments, -1) is distinct from coalesce(b.paid_installments, -1);
-- Esperado: 0.

-- Resumo do lote simulado (relatório exigido no item 10):
select status, count(*) as contratos,
       round(sum(coalesce(new_remaining_amount, 0) - coalesce(old_remaining_amount, 0)), 2) as delta_total
from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID>'
group by status
order by status;


-- ----------------------------------------------------------------------------
-- 3. OPTIMISTIC LOCKING / STALE  [ESCRITA em contrato de teste]
-- ----------------------------------------------------------------------------
-- 3.1 escolha um contrato de teste seu:
--     select id, user_id, remaining_amount, paid_installments from public.loans where id = '<LOAN_TESTE>';
-- 3.2 gere o payload com expected_remaining_amount = valor atual;
-- 3.3 simule um pagamento concorrente mudando SOMENTE o cache:
--     update public.loans set remaining_amount = remaining_amount - 1 where id = '<LOAN_TESTE>';
-- 3.4 execute o backfill real com dry_run = false;
-- 3.5 confirme:
select status from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID>' and loan_id = '<LOAN_TESTE>' order by executed_at desc limit 1;
-- Esperado: STALE.
select remaining_amount from public.loans where id = '<LOAN_TESTE>';
-- Esperado: o valor MAIS RECENTE (o do passo 3.3), não o do diagnóstico.


-- ----------------------------------------------------------------------------
-- 4. RLS — usuário comum × administrador
-- ----------------------------------------------------------------------------
-- Rode cada bloco autenticado como o usuário correspondente (Supabase SQL Editor
-- em modo "run as authenticated user", ou via PostgREST com o JWT do usuário).
--
-- 4.1 Usuário comum tentando backfill de contrato de TERCEIRO:
--     select * from public.rpc_v3_backfill_cache('teste-rls', '[{"loan_id":"<LOAN_DE_OUTRO>","remaining_amount":1,"paid_installments":0}]'::jsonb, '{}', '{}', true);
--     Esperado: 0 linhas (RLS de `loans` esconde o contrato) — nunca APPLIED.
-- 4.2 Usuário comum lendo snapshots de terceiro:
--     select count(*) from public.rpc_v3_migration_snapshots where user_id <> auth.uid();
--     Esperado: 0.
-- 4.3 Administrador executando backfill de contrato de terceiro:
--     Esperado: status APPLIED e snapshot gravado com user_id = DONO do contrato
--               e executed_by = admin.
--     ⚠️ Se retornar BLOCKED_BY_RLS, a policy de UPDATE da tabela `loans` ainda
--        não permite admin — corrija lá, não nesta função.
select user_id, executed_by, status
from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID_ADMIN>';


-- ----------------------------------------------------------------------------
-- 5. CONCORRÊNCIA (duas sessões simultâneas)
-- ----------------------------------------------------------------------------
-- Sessão A:  begin; select * from public.rpc_v3_backfill_cache('lote-a', <payload>, '{}', '{}', false);
--            -- não faça commit ainda
-- Sessão B:  begin; select * from public.rpc_v3_backfill_cache('lote-b', <mesmo payload>, '{}', '{}', false);
--            -- deve FICAR BLOQUEADA até A finalizar (lock por loan_id em ordem crescente)
-- Sessão A:  commit;
-- Sessão B:  deve destravar e retornar STALE/SKIPPED (nunca sobrescrever A).
-- Esperado: nenhum deadlock, nenhum last-write-wins.


-- ----------------------------------------------------------------------------
-- 6. ROLLBACK
-- ----------------------------------------------------------------------------
select * from public.rpc_v3_rollback_batch('<BATCH_ID>');
-- Esperado: restored = true apenas onde o valor atual ainda é o aplicado pelo lote.
select * from public.rpc_v3_rollback_batch('<BATCH_ID>');
-- Esperado (execução dupla): 0 linhas — idempotente, sem efeito colateral.
select status, count(*) from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID>' group by status;
-- Esperado: trilha ROLLED_BACK presente.


-- ----------------------------------------------------------------------------
-- 7. BLOCKLIST — contratos em revisão manual
-- ----------------------------------------------------------------------------
-- Passe SEMPRE os loan_ids (nunca nomes) em p_blocked_loan_ids e, se quiser
-- bloquear a carteira inteira de alguém, os user_ids em p_blocked_user_ids.
select id, user_id, borrower_name from public.loans
where id = any (array['<LOAN_1>','<LOAN_2>','<LOAN_3>']::uuid[]);
-- Depois do dry-run, confirme:
select loan_id, status from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID>' and loan_id = any (array['<LOAN_1>','<LOAN_2>','<LOAN_3>']::uuid[]);
-- Esperado: BLOCKED (ou ausência total do lote).
