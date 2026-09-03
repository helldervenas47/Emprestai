-- ==============================================================================
-- Migration: Score de Risco Não-Rígido, Bônus de Streak e Score em Tempo Real
-- Decisões de Arquitetura:
-- 1. Fórmula Justa: Tolerância de 3 dias, penalidade sqrt e bônus de streak.
-- 2. Performance: Caminho síncrono O(1) com fallback O(N_cliente) para retroativos/deletes.
-- 3. Tempo Real: View com índice parcial para penalizar parcelas vencidas em aberto.
-- ==============================================================================

-- 1. ADICIONAR NOVAS COLUNAS DENORMALIZADAS NA TABELA DE CLIENTES
-- ------------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dias_atraso_excedente_acumulado INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_atual INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maior_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_data_vencimento_processada DATE DEFAULT NULL;


-- 2. FUNÇÃO AUXILIAR DE PESO (COMPARTILHADA ENTRE FUNÇÕES E VIEWS)
-- ------------------------------------------------------------------------------
-- Centraliza o peso de dias de atraso para evitar duplicação entre PL/pgSQL e SQL puro.
CREATE OR REPLACE FUNCTION public.fn_peso_dias_atraso_atual()
RETURNS NUMERIC AS $$
  SELECT 1.5::NUMERIC;
$$ LANGUAGE sql IMMUTABLE;


-- 3. FUNÇÃO PURA DE CÁLCULO DO SCORE (FÓRMULA SUAVE / NÃO-RÍGIDA)
-- ------------------------------------------------------------------------------
-- Recebe apenas contadores em memória e calcula o score de 0 a 150.
CREATE OR REPLACE FUNCTION public.fn_calcular_score(
  p_total INTEGER,
  p_atrasados INTEGER,
  p_dias_atraso_excedente INTEGER,
  p_streak_atual INTEGER,
  p_maior_streak INTEGER
)
RETURNS NUMERIC AS $$
DECLARE
  -- Constantes de Pesos e Parâmetros Ajustáveis
  c_tolerancia_dias    CONSTANT INTEGER := 3;     -- Aplicada no acúmulo dos contadores
  c_peso_proporcao      CONSTANT NUMERIC := 40.0;  -- Peso da proporção de atrasos
  c_peso_dias_sqrt      CONSTANT NUMERIC := 1.5;   -- Suaviza atrasos grandes (curva sqrt em vez de linear)
  c_teto_penalidade     CONSTANT NUMERIC := 50.0;  -- Limite máximo de penalidade
  c_peso_streak_atual   CONSTANT NUMERIC := 0.8;   -- Bônus por consistência recente
  c_teto_bonus_streak   CONSTANT NUMERIC := 35.0;  -- Teto de bônus para streak atual
  c_peso_maior_streak   CONSTANT NUMERIC := 3.0;   -- Bônus logarítmico para recorde histórico
  c_teto_bonus_recorde  CONSTANT NUMERIC := 10.0;  -- Teto de bônus para maior streak histórico

  v_penalidade          NUMERIC;
  v_bonus               NUMERIC;
  v_score               NUMERIC;
BEGIN
  p_total := COALESCE(p_total, 0);
  p_atrasados := COALESCE(p_atrasados, 0);
  p_dias_atraso_excedente := COALESCE(p_dias_atraso_excedente, 0);
  p_streak_atual := COALESCE(p_streak_atual, 0);
  p_maior_streak := COALESCE(p_maior_streak, 0);

  -- Penalidade desacelerada (sqrt): diferença entre 5 e 10 dias pesa menos que entre 30 e 60
  IF p_atrasados = 0 OR p_total = 0 THEN
    v_penalidade := 0.0;
  ELSE
    v_penalidade := LEAST(
      c_teto_penalidade,
      ((p_atrasados::NUMERIC / p_total) * c_peso_proporcao)
      + (SQRT(GREATEST(p_dias_atraso_excedente, 0))::NUMERIC * c_peso_dias_sqrt)
    );
  END IF;

  -- Bônus por bom comportamento: streak atual pesa mais que recorde antigo
  v_bonus := LEAST(c_teto_bonus_streak, p_streak_atual * c_peso_streak_atual)
           + LEAST(c_teto_bonus_recorde, LN(1 + GREATEST(p_maior_streak, 0))::NUMERIC * c_peso_maior_streak);

  -- Base 100 com piso 0 e teto 150
  v_score := 100.0 - v_penalidade + v_bonus;
  RETURN GREATEST(0.0, LEAST(150.0, ROUND(v_score::NUMERIC, 2)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- 4. RECONCILIAÇÃO ESCOPADA POR CLIENTE
-- ------------------------------------------------------------------------------
-- Reconstrói a cronologia completa de UM ÚNICO CLIENTE (O(N_cliente)) em caso de
-- estornos, deleções ou pagamentos retroativos.
CREATE OR REPLACE FUNCTION public.fn_reconciliar_scores_por_cliente(p_cliente_id UUID)
RETURNS VOID AS $$
DECLARE
  c_tolerancia_dias CONSTANT INTEGER := 3;
  r RECORD;
  v_total INTEGER := 0;
  v_atrasados INTEGER := 0;
  v_dias_excedentes INTEGER := 0;
  v_streak_atual INTEGER := 0;
  v_maior_streak INTEGER := 0;
  v_ultima_venc DATE := NULL;
  v_atraso_bruto INTEGER := 0;
  v_score NUMERIC := 100.0;
  v_total_quitados INTEGER := 0;
  v_valor_em_atraso NUMERIC := 0;
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN;
  END IF;

  -- Itera sobre os pagamentos realizados do cliente na ordem cronológica de pagamento/vencimento
  FOR r IN
    SELECT data_vencimento, data_pagamento
    FROM public.pagamentos
    WHERE cliente_id = p_cliente_id
      AND data_pagamento IS NOT NULL
    ORDER BY data_pagamento ASC, data_vencimento ASC
  LOOP
    v_total := v_total + 1;
    v_atraso_bruto := GREATEST(0, (r.data_pagamento - r.data_vencimento));

    IF v_atraso_bruto <= c_tolerancia_dias THEN
      -- Dentro da tolerância de 3 dias: não conta como atraso e avança o streak
      v_streak_atual := v_streak_atual + 1;
      v_maior_streak := GREATEST(v_maior_streak, v_streak_atual);
    ELSE
      -- Atraso além da tolerância: quebra o streak e acumula apenas o excedente
      v_streak_atual := 0;
      v_atrasados := v_atrasados + 1;
      v_dias_excedentes := v_dias_excedentes + (v_atraso_bruto - c_tolerancia_dias);
    END IF;

    IF v_ultima_venc IS NULL OR r.data_vencimento > v_ultima_venc THEN
      v_ultima_venc := r.data_vencimento;
    END IF;
  END LOOP;

  -- Contagem de empréstimos quitados e valor em atraso ativo
  SELECT COUNT(*) INTO v_total_quitados
  FROM public.emprestimos
  WHERE cliente_id = p_cliente_id AND status = 'quitado';

  SELECT COALESCE(SUM(valor), 0) INTO v_valor_em_atraso
  FROM public.pagamentos
  WHERE cliente_id = p_cliente_id
    AND data_pagamento IS NULL
    AND data_vencimento < CURRENT_DATE;

  -- Calcula o score a partir dos contadores reconstruídos
  v_score := public.fn_calcular_score(
    v_total,
    v_atrasados,
    v_dias_excedentes,
    v_streak_atual,
    v_maior_streak
  );

  -- Atualiza o cliente
  UPDATE public.clients
  SET
    qtd_pagamentos_total = v_total,
    qtd_pagamentos_atrasados = v_atrasados,
    dias_atraso_excedente_acumulado = v_dias_excedentes,
    valor_em_atraso = v_valor_em_atraso,
    qtd_emprestimos_quitados = v_total_quitados,
    streak_atual = v_streak_atual,
    maior_streak = v_maior_streak,
    ultima_data_vencimento_processada = v_ultima_venc,
    score_risco = v_score,
    score_atualizado_em = now()
  WHERE id = p_cliente_id;
END;
$$ LANGUAGE plpgsql;


-- 5. RECONCILIAÇÃO GERAL PERIÓDICA (SEGURANÇA CONTRA DRIFT)
-- ------------------------------------------------------------------------------
-- Roda via rotina agendada (ex: cron noturno) para garantir consistência da base toda.
CREATE OR REPLACE FUNCTION public.fn_reconciliar_scores_todos()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.clients LOOP
    PERFORM public.fn_reconciliar_scores_por_cliente(r.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- 6. TRIGGER INCREMENTAL COM DETECÇÃO DE CASOS FORA DE ORDEM
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_trg_pagamentos_incremental_score_v2()
RETURNS TRIGGER AS $$
DECLARE
  c_tolerancia_dias CONSTANT INTEGER := 3;
  v_cliente RECORD;
  v_atraso_bruto INTEGER;
  v_novo_streak INTEGER;
  v_novo_maior INTEGER;
  v_novo_atrasados INTEGER;
  v_novo_excedente INTEGER;
  v_novo_total INTEGER;
  v_novo_score NUMERIC;
BEGIN
  -- CENÁRIO 1: DELETE (estorno/exclusão de parcela)
  IF TG_OP = 'DELETE' THEN
    IF OLD.data_pagamento IS NOT NULL THEN
      PERFORM public.fn_reconciliar_scores_por_cliente(OLD.cliente_id);
    END IF;
    RETURN OLD;
  END IF;

  -- CENÁRIO 2: UPDATE de uma parcela que não alterou data de pagamento/vencimento (Guard de Idempotência)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento AND
       OLD.data_vencimento IS NOT DISTINCT FROM NEW.data_vencimento THEN
      RETURN NEW;
    END IF;

    -- Se desmarcou pagamento ou se alterou uma parcela que já estava paga (correção retroativa)
    IF (OLD.data_pagamento IS NOT NULL AND NEW.data_pagamento IS NULL) OR
       (OLD.data_pagamento IS NOT NULL AND NEW.data_pagamento IS NOT NULL) THEN
      PERFORM public.fn_reconciliar_scores_por_cliente(NEW.cliente_id);
      RETURN NEW;
    END IF;
  END IF;

  -- CENÁRIO 3: NOVO PAGAMENTO EFETIVADO (INSERT ou UPDATE marcando data_pagamento)
  IF NEW.data_pagamento IS NOT NULL THEN
    -- Busca contadores atuais do cliente
    SELECT * INTO v_cliente
    FROM public.clients
    WHERE id = NEW.cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    -- Detecta se o pagamento é retroativo (fora de ordem cronológica)
    IF v_cliente.ultima_data_vencimento_processada IS NOT NULL AND
       NEW.data_vencimento < v_cliente.ultima_data_vencimento_processada THEN
      -- Cai no fallback seguro O(N_cliente)
      PERFORM public.fn_reconciliar_scores_por_cliente(NEW.cliente_id);
      RETURN NEW;
    END IF;

    -- FLUXO NORMAL EM ORDEM (O(1)):
    v_atraso_bruto := GREATEST(0, (NEW.data_pagamento - NEW.data_vencimento));
    v_novo_total := v_cliente.qtd_pagamentos_total + 1;

    IF v_atraso_bruto <= c_tolerancia_dias THEN
      -- Não conta como atraso e incrementa streak
      v_novo_streak := v_cliente.streak_atual + 1;
      v_novo_maior := GREATEST(v_cliente.maior_streak, v_novo_streak);
      v_novo_atrasados := v_cliente.qtd_pagamentos_atrasados;
      v_novo_excedente := v_cliente.dias_atraso_excedente_acumulado;
    ELSE
      -- Reseta streak e soma o excedente
      v_novo_streak := 0;
      v_novo_maior := v_cliente.maior_streak;
      v_novo_atrasados := v_cliente.qtd_pagamentos_atrasados + 1;
      v_novo_excedente := v_cliente.dias_atraso_excedente_acumulado + (v_atraso_bruto - c_tolerancia_dias);
    END IF;

    v_novo_score := public.fn_calcular_score(
      v_novo_total,
      v_novo_atrasados,
      v_novo_excedente,
      v_novo_streak,
      v_novo_maior
    );

    UPDATE public.clients
    SET
      qtd_pagamentos_total = v_novo_total,
      qtd_pagamentos_atrasados = v_novo_atrasados,
      dias_atraso_excedente_acumulado = v_novo_excedente,
      streak_atual = v_novo_streak,
      maior_streak = v_novo_maior,
      ultima_data_vencimento_processada = GREATEST(COALESCE(v_cliente.ultima_data_vencimento_processada, NEW.data_vencimento), NEW.data_vencimento),
      score_risco = v_novo_score,
      score_atualizado_em = now()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Substitui a trigger anterior pela V2
DROP TRIGGER IF EXISTS trg_pagamentos_incremental_score ON public.pagamentos;
DROP TRIGGER IF EXISTS trg_pagamentos_incremental_score_v2 ON public.pagamentos;

CREATE TRIGGER trg_pagamentos_incremental_score_v2
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_pagamentos_incremental_score_v2();


-- 7. ÍNDICES OTIMIZADOS E ÍNDICE PARCIAL PARA DÍVIDA ATIVA
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_vencimento
  ON public.pagamentos (cliente_id, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_pagamento
  ON public.pagamentos (cliente_id, data_pagamento);

CREATE INDEX IF NOT EXISTS idx_emprestimos_cliente_status
  ON public.emprestimos (cliente_id, status);

-- Índice parcial ultra-eficiente para consulta de parcelas em aberto
CREATE INDEX IF NOT EXISTS idx_pagamentos_pendentes_vencidos
  ON public.pagamentos (cliente_id, data_vencimento)
  WHERE data_pagamento IS NULL;


-- 8. VIEW DE SCORE EM TEMPO REAL (PENALIZAÇÃO DE PARCELAS VENCIDAS EM ABERTO)
-- ------------------------------------------------------------------------------
-- Combina o score_risco histórico (O(1)) com o risco presente (parcelas pendentes vencidas)
CREATE OR REPLACE VIEW public.vw_clientes_score AS
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


-- 9. POPULAÇÃO INICIAL / RECONCILIAÇÃO DE DADOS EXISTENTES
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.fn_reconciliar_scores_todos();
END $$;
