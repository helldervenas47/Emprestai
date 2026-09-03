-- ============================================================================
-- GERADOR DE PAYLOAD PARA O BLOCO 2 (DRY-RUN) — RPC FINANCEIRA V3
-- ============================================================================
-- Use este arquivo quando você NÃO quiser (ou não puder) abrir o Painel de
-- Migração no app (rota /diagnostico-financeiro → seção "Etapa final — RPC
-- Financeira V3" → botão "SQL do backfill").
--
-- ⚠️ IMPORTANTE
--   • O payload REAL (com os valores corrigidos calculados pela lógica oficial
--     em TypeScript) só é produzido pelo Painel de Migração. O SQL abaixo NÃO
--     recalcula nada — ele apenas monta o payload no formato exigido pela RPC.
--   • O bloco A gera um payload IDENTIDADE (valores atuais). Serve para validar
--     encanamento, RLS, snapshot e imutabilidade do dry-run sem risco algum.
--   • Nada aqui escreve em `loans`: todas as chamadas usam dry_run = true.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. PAYLOAD IDENTIDADE (smoke test do Bloco 2) — 100% seguro
-- ----------------------------------------------------------------------------
-- Copie o resultado da coluna `payload` e cole na chamada do bloco C.
-- Ajuste o WHERE para limitar o lote (recomendado começar com 5–20 contratos).
select jsonb_agg(
         jsonb_build_object(
           'loan_id', l.id,
           'remaining_amount', round(coalesce(l.remaining_amount, 0)::numeric, 2),
           'paid_installments', coalesce(l.paid_installments, 0),
           'expected_remaining_amount', round(coalesce(l.remaining_amount, 0)::numeric, 2),
           'expected_paid_installments', coalesce(l.paid_installments, 0)
         )
         order by l.id
       ) as payload
from public.loans l
where l.status <> 'paid'          -- ajuste conforme necessário
limit 20;                          -- o limit se aplica ao select interno; use uma subquery para lotes maiores


-- ----------------------------------------------------------------------------
-- B. PAYLOAD REAL — vindo do Painel de Migração
-- ----------------------------------------------------------------------------
-- 1. Abra o app autenticado como administrador.
-- 2. Acesse a rota /diagnostico-financeiro.
-- 3. Role até o card "Etapa final — RPC Financeira V3".
-- 4. Clique em "SQL do backfill" (baixa `backfill_<batch_id>.sql`, já com a
--    chamada dry_run = true pronta) e em "Snapshot" (JSON de conferência).
-- 5. Cole o conteúdo do arquivo no SQL Editor e execute apenas a seção 1
--    (a seção 2, de aplicação real, vem comentada de propósito).
-- Observação: o card só aparece para usuários com role `admin` (ou em
-- dev/preview com VITE_FINANCIAL_DIFF_DIAGNOSTICS=true).


-- ----------------------------------------------------------------------------
-- C. CHAMADA DE DRY-RUN (Bloco 2 da suíte de validação)
-- ----------------------------------------------------------------------------
create temp table if not exists _loans_before as
  select id, remaining_amount, paid_installments from public.loans;

select *
from public.rpc_v3_backfill_cache(
  'dryrun-' || to_char(now(), 'YYYYMMDDHH24MISS'),  -- batch_id
  '<COLE_AQUI_O_PAYLOAD>'::jsonb,                    -- payload do bloco A ou B
  '{}'::uuid[],                                      -- loan_ids bloqueados
  '{}'::uuid[],                                      -- user_ids bloqueados
  true                                               -- dry_run
);

-- Prova de imutabilidade (esperado: 0)
select count(*) as linhas_alteradas_durante_dry_run
from public.loans l
join _loans_before b on b.id = l.id
where coalesce(l.remaining_amount, -1) is distinct from coalesce(b.remaining_amount, -1)
   or coalesce(l.paid_installments, -1) is distinct from coalesce(b.paid_installments, -1);

-- Resumo do lote simulado (troque pelo batch_id usado acima)
select status, count(*) as contratos,
       round(sum(coalesce(new_remaining_amount, 0) - coalesce(old_remaining_amount, 0)), 2) as delta_total
from public.rpc_v3_migration_snapshots
where batch_id = '<BATCH_ID>'
group by status
order by status;
