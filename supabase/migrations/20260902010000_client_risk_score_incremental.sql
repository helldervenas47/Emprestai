-- ==============================================================================
-- Migration: Sistema de Score de Risco Incremental por Cliente (Supabase / Postgres)
-- Objetivo: Garantir cálculo O(1) de score de crédito sem table scans síncronos
-- ==============================================================================

-- 1. TABELAS DE EMPRÉSTIMOS E PAGAMENTOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emprestimos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  valor NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'quitado', 'atrasado', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  emprestimo_id UUID REFERENCES public.emprestimos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  valor NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  data_vencimento DATE NOT NULL,
  data_pagamento DATE DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS e criar políticas de forma 100% idempotente
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emprestimos_all_authenticated" ON public.emprestimos;
CREATE POLICY "emprestimos_all_authenticated" ON public.emprestimos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pagamentos_all_authenticated" ON public.pagamentos;
CREATE POLICY "pagamentos_all_authenticated" ON public.pagamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2. COLUNAS DENORMALIZADAS NA TABELA DE CLIENTES
-- ------------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS qtd_pagamentos_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qtd_pagamentos_atrasados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_atraso_acumulado INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_em_atraso NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qtd_emprestimos_quitados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_risco NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS score_atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();


-- 3. FUNÇÃO PURA DE CÁLCULO DO SCORE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calcular_score(
  p_qtd_total INTEGER,
  p_qtd_atrasados INTEGER,
  p_dias_atraso INTEGER,
  p_valor_em_atraso NUMERIC,
  p_qtd_quitados INTEGER
)
RETURNS NUMERIC AS $$
DECLARE
  c_score_base            CONSTANT NUMERIC := 100.0;
  c_bonus_quitado         CONSTANT NUMERIC := 5.0;
  c_bonus_em_dia          CONSTANT NUMERIC := 3.0;
  c_penalidade_atraso     CONSTANT NUMERIC := 5.0;
  c_penalidade_dia_atraso CONSTANT NUMERIC := 0.5;
  c_max_penalidade_dias   CONSTANT NUMERIC := 40.0;
  c_score_min             CONSTANT NUMERIC := 0.0;
  c_score_max             CONSTANT NUMERIC := 150.0;

  v_qtd_em_dia            INTEGER;
  v_penalidade_dias       NUMERIC;
  v_score_calculado       NUMERIC;
BEGIN
  p_qtd_total := COALESCE(p_qtd_total, 0);
  p_qtd_atrasados := COALESCE(p_qtd_atrasados, 0);
  p_dias_atraso := COALESCE(p_dias_atraso, 0);
  p_qtd_quitados := COALESCE(p_qtd_quitados, 0);

  IF p_qtd_total = 0 AND p_qtd_quitados = 0 THEN
    RETURN c_score_base;
  END IF;

  v_qtd_em_dia := GREATEST(0, p_qtd_total - p_qtd_atrasados);
  v_penalidade_dias := LEAST(c_max_penalidade_dias, GREATEST(0, p_dias_atraso) * c_penalidade_dia_atraso);

  v_score_calculado := c_score_base
    + (v_qtd_em_dia * c_bonus_em_dia)
    + (p_qtd_quitados * c_bonus_quitado)
    - (p_qtd_atrasados * c_penalidade_atraso)
    - v_penalidade_dias;

  RETURN GREATEST(c_score_min, LEAST(c_score_max, ROUND(v_score_calculado, 2)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- 4. TRIGGER INCREMENTAL EM PAGAMENTOS (CUSTO O(1))
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_trg_pagamentos_incremental_score()
RETURNS TRIGGER AS $$
DECLARE
  v_dias_atraso INTEGER := 0;
  v_is_atrasado BOOLEAN := FALSE;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.data_pagamento IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND NEW.data_pagamento IS NOT NULL AND (OLD.data_pagamento IS NULL OR OLD.data_pagamento <> NEW.data_pagamento)) THEN

    IF NEW.data_pagamento > NEW.data_vencimento THEN
      v_dias_atraso := (NEW.data_pagamento - NEW.data_vencimento);
      v_is_atrasado := TRUE;
    ELSE
      v_dias_atraso := 0;
      v_is_atrasado := FALSE;
    END IF;

    UPDATE public.clients
    SET
      qtd_pagamentos_total = qtd_pagamentos_total + 1,
      qtd_pagamentos_atrasados = qtd_pagamentos_atrasados + (CASE WHEN v_is_atrasado THEN 1 ELSE 0 END),
      dias_atraso_acumulado = dias_atraso_acumulado + v_dias_atraso,
      score_risco = public.fn_calcular_score(
        qtd_pagamentos_total + 1,
        qtd_pagamentos_atrasados + (CASE WHEN v_is_atrasado THEN 1 ELSE 0 END),
        dias_atraso_acumulado + v_dias_atraso,
        valor_em_atraso,
        qtd_emprestimos_quitados
      ),
      score_atualizado_em = now()
    WHERE id = NEW.cliente_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagamentos_incremental_score ON public.pagamentos;
CREATE TRIGGER trg_pagamentos_incremental_score
  AFTER INSERT OR UPDATE OF data_pagamento, data_vencimento
  ON public.pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_pagamentos_incremental_score();


-- Trigger de Quitação Incremental em Empréstimos (O(1))
CREATE OR REPLACE FUNCTION public.fn_trg_emprestimos_incremental_score()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'quitado' AND OLD.status <> 'quitado') OR
     (TG_OP = 'INSERT' AND NEW.status = 'quitado') THEN

    UPDATE public.clients
    SET
      qtd_emprestimos_quitados = qtd_emprestimos_quitados + 1,
      score_risco = public.fn_calcular_score(
        qtd_pagamentos_total,
        qtd_pagamentos_atrasados,
        dias_atraso_acumulado,
        valor_em_atraso,
        qtd_emprestimos_quitados + 1
      ),
      score_atualizado_em = now()
    WHERE id = NEW.cliente_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emprestimos_incremental_score ON public.emprestimos;
CREATE TRIGGER trg_emprestimos_incremental_score
  AFTER INSERT OR UPDATE OF status
  ON public.emprestimos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_emprestimos_incremental_score();


-- 5. ÍNDICES PARA EVITAR TABLE SCANS
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_vencimento
  ON public.pagamentos (cliente_id, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_emprestimos_cliente_status
  ON public.emprestimos (cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_clients_score_risco
  ON public.clients (score_risco DESC);


-- 6. JOB DE RECONCILIAÇÃO PERIÓDICA (SEGURANÇA CONTRA DRIFT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reconciliar_scores(p_cliente_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  WITH resumo_pagamentos AS (
    SELECT
      p.cliente_id,
      COUNT(*) FILTER (WHERE p.data_pagamento IS NOT NULL)::INTEGER AS total_pagos,
      COUNT(*) FILTER (WHERE p.data_pagamento IS NOT NULL AND p.data_pagamento > p.data_vencimento)::INTEGER AS total_atrasados,
      COALESCE(SUM(GREATEST(0, p.data_pagamento - p.data_vencimento)) FILTER (WHERE p.data_pagamento IS NOT NULL), 0)::INTEGER AS dias_atraso,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'atrasado' OR (p.data_pagamento IS NULL AND p.data_vencimento < CURRENT_DATE)), 0)::NUMERIC AS valor_atraso
    FROM public.pagamentos p
    WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    GROUP BY p.cliente_id
  ),
  resumo_emprestimos AS (
    SELECT
      e.cliente_id,
      COUNT(*) FILTER (WHERE e.status = 'quitado')::INTEGER AS total_quitados
    FROM public.emprestimos e
    WHERE (p_cliente_id IS NULL OR e.cliente_id = p_cliente_id)
    GROUP BY e.cliente_id
  )
  UPDATE public.clients c
  SET
    qtd_pagamentos_total = COALESCE(rp.total_pagos, 0),
    qtd_pagamentos_atrasados = COALESCE(rp.total_atrasados, 0),
    dias_atraso_acumulado = COALESCE(rp.dias_atraso, 0),
    valor_em_atraso = COALESCE(rp.valor_atraso, 0),
    qtd_emprestimos_quitados = COALESCE(re.total_quitados, 0),
    score_risco = public.fn_calcular_score(
      COALESCE(rp.total_pagos, 0),
      COALESCE(rp.total_atrasados, 0),
      COALESCE(rp.dias_atraso, 0),
      COALESCE(rp.valor_atraso, 0),
      COALESCE(re.total_quitados, 0)
    ),
    score_atualizado_em = now()
  FROM public.clients c2
  LEFT JOIN resumo_pagamentos rp ON rp.cliente_id = c2.id
  LEFT JOIN resumo_emprestimos re ON re.cliente_id = c2.id
  WHERE c.id = c2.id
    AND (p_cliente_id IS NULL OR c.id = p_cliente_id);
END;
$$ LANGUAGE plpgsql;
