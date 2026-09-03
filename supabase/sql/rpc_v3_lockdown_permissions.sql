-- ============================================================================
-- ETAPA 4.2 — LOCKDOWN EMERGENCIAL DE PERMISSÕES DAS FUNÇÕES RPC V3
-- ============================================================================
-- EXECUTAR PRIMEIRO, ANTES DE QUALQUER OUTRA MIGRATION DA ETAPA 4.
--
-- Motivo (achado 3B.2 / Etapa 4):
--   `public.rpc_v3_validate_backfill_payload` está executável pela role `anon`.
--   Com apenas a publishable key e um UUID de contrato é possível ler dados
--   financeiros (nome do tomador, saldo, parcelas pagas), contornando o RLS de
--   `public.loans` porque a versão INSTALADA está como SECURITY DEFINER.
--
-- Este script SÓ altera privilégios. Nenhum corpo de função é modificado,
-- nenhuma linha de loans/payments/loan_installments é tocada.
--
-- ATENÇÃO ÀS ASSINATURAS: confirme com
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname like 'rpc_v3_%';
-- O bloco DO abaixo revoga por OID, então funciona para QUALQUER assinatura
-- instalada (inclusive versões divergentes/legadas), sem adivinhação.
-- ============================================================================

begin;

-- 1. Revogação genérica por OID: cobre todas as sobrecargas instaladas de
--    qualquer função `public.rpc_v3_*`, inclusive versões não versionadas.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as sch,
           p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'rpc\_v3\_%'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      r.sch, r.fn, r.args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.sch, r.fn, r.args
    );
  end loop;
end $$;

-- 2. Revogações explícitas (idempotentes) para as assinaturas homologadas.
--    Ficam comentadas caso a assinatura instalada divirja — o bloco 1 já cobriu.
-- revoke all on function public.rpc_v3_validate_backfill_payload(jsonb) from public, anon, authenticated;
-- revoke all on function public.rpc_v3_backfill_cache(text, jsonb, uuid[], uuid[], boolean) from public, anon, authenticated;
-- revoke all on function public.rpc_v3_rollback_batch(text) from public, anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA (somente leitura) — nenhuma linha deve aparecer para anon/PUBLIC
-- ----------------------------------------------------------------------------
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       coalesce(p.proacl::text, '(default: PUBLIC)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'rpc\_v3\_%'
order by p.proname;
-- Esperado: acl contendo somente service_role=X/postgres (e o owner).
--           NENHUM `anon=X`, `authenticated=X` ou `=X/` (PUBLIC).

-- Reteste do vazamento (deve falhar com permission denied usando a anon key):
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -X POST "$SUPABASE_URL/rest/v1/rpc/rpc_v3_validate_backfill_payload" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"p_payload":[{"loan_id":"00000000-0000-0000-0000-000000000000"}]}'
--   Esperado: 401/403/404 com "permission denied for function ..." — NUNCA 200.
