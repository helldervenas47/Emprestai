-- =====================================================================
-- Correção: cofrinhos e aportes gravados com percentual_cdi = 0 (ou NULL)
-- Efeito do bug: taxa anual = CDI x 0% => rendimento zerado.
-- Regra adotada: percentual_cdi inválido (<= 0 ou NULL) equivale a 100% do CDI.
--
-- Execute no SQL Editor do Supabase. É idempotente.
-- Depois de rodar, dispare a Edge Function `recalcular-historico-cofrinhos`
-- (com o header X-Cron-Secret) para regravar os rendimentos derivados.
-- =====================================================================

BEGIN;

-- 1) Snapshot de auditoria (o que será alterado)
CREATE TABLE IF NOT EXISTS public.cofrinho_percentual_cdi_fix_audit (
  id             bigserial PRIMARY KEY,
  executado_em   timestamptz NOT NULL DEFAULT now(),
  entidade       text NOT NULL,
  registro_id    uuid NOT NULL,
  valor_anterior numeric,
  valor_novo     numeric NOT NULL
);

INSERT INTO public.cofrinho_percentual_cdi_fix_audit (entidade, registro_id, valor_anterior, valor_novo)
SELECT 'cofrinhos', c.id, c.percentual_cdi, 100
FROM public.cofrinhos c
WHERE c.percentual_cdi IS NULL OR c.percentual_cdi <= 0;

INSERT INTO public.cofrinho_percentual_cdi_fix_audit (entidade, registro_id, valor_anterior, valor_novo)
SELECT 'cofrinho_aportes', a.id, a.percentual_cdi, 100
FROM public.cofrinho_aportes a
WHERE a.percentual_cdi IS NULL OR a.percentual_cdi <= 0;

-- 2) Correção dos cofrinhos
UPDATE public.cofrinhos
SET percentual_cdi = 100
WHERE percentual_cdi IS NULL OR percentual_cdi <= 0;

-- 3) Correção dos aportes (herdando o percentual do cofrinho quando válido)
UPDATE public.cofrinho_aportes a
SET percentual_cdi = COALESCE(NULLIF(c.percentual_cdi, 0), 100)
FROM public.cofrinhos c
WHERE c.id = a.cofrinho_id
  AND (a.percentual_cdi IS NULL OR a.percentual_cdi <= 0);

-- 4) Linhas de rendimento diário já gravadas com percentual zerado
UPDATE public.cofrinho_rendimento_diario r
SET percentual_cdi = COALESCE(NULLIF(a.percentual_cdi, 0), 100)
FROM public.cofrinho_aportes a
WHERE a.id = r.aporte_id
  AND (r.percentual_cdi IS NULL OR r.percentual_cdi <= 0);

-- 5) Blindagem contra reincidência
ALTER TABLE public.cofrinhos       ALTER COLUMN percentual_cdi SET DEFAULT 100;
ALTER TABLE public.cofrinho_aportes ALTER COLUMN percentual_cdi SET DEFAULT 100;

ALTER TABLE public.cofrinhos DROP CONSTRAINT IF EXISTS cofrinhos_percentual_cdi_positivo;
ALTER TABLE public.cofrinhos
  ADD CONSTRAINT cofrinhos_percentual_cdi_positivo
  CHECK (percentual_cdi IS NULL OR percentual_cdi > 0) NOT VALID;

ALTER TABLE public.cofrinho_aportes DROP CONSTRAINT IF EXISTS cofrinho_aportes_percentual_cdi_positivo;
ALTER TABLE public.cofrinho_aportes
  ADD CONSTRAINT cofrinho_aportes_percentual_cdi_positivo
  CHECK (percentual_cdi IS NULL OR percentual_cdi > 0) NOT VALID;

COMMIT;

-- 6) Conferência
SELECT entidade, count(*) AS registros_corrigidos
FROM public.cofrinho_percentual_cdi_fix_audit
GROUP BY entidade;

-- 7) Recalcular derivados (rendimentos, saldos) — rode para cada cofrinho corrigido:
--    POST {SUPABASE_URL}/functions/v1/recalcular-historico-cofrinhos
--    Headers: X-Cron-Secret: <cron_secret>, Content-Type: application/json
--    Body: {}            -> recalcula todos
--          {"cofrinho_id":"<uuid>"} -> recalcula apenas um
