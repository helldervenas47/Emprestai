-- ==============================================================================
-- Migration: Corrigir RLS na View vw_clientes_score (Security Invoker)
-- Motivo: Views no Postgres por padrão ignoram o RLS da tabela base.
-- Adicionando WITH (security_invoker = true), a view passa a respeitar
-- estritamente o auth.uid() = user_id da tabela clients para cada usuário.
-- ==============================================================================

CREATE OR REPLACE VIEW public.vw_clientes_score
WITH (security_invoker = true)
AS
SELECT
  c.*,
  GREATEST(0.0, LEAST(150.0,
    ROUND((c.score_risco - COALESCE(vencidos.penalidade_atual, 0.0))::NUMERIC, 2)
  )) AS score_tempo_real
FROM public.clients c
LEFT JOIN LATERAL (
  SELECT
    (SQRT(SUM(CURRENT_DATE - p.data_vencimento))::NUMERIC
      * public.fn_peso_dias_atraso_atual())::NUMERIC AS penalidade_atual
  FROM public.pagamentos p
  WHERE p.cliente_id = c.id
    AND p.data_pagamento IS NULL
    AND p.data_vencimento < CURRENT_DATE
) vencidos ON TRUE;
