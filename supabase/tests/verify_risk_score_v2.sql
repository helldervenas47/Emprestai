-- ==============================================================================
-- Script de Validação V2: Score de Risco Suave, Streak, Tolerância e Tempo Real
-- ==============================================================================

DO $$
DECLARE
  v_cliente_id UUID;
  v_emp_id UUID;
  v_pag_id_1 UUID;
  v_pag_id_2 UUID;
  v_pag_id_3 UUID;
  v_pag_id_4 UUID;
  v_c RECORD;
  v_view RECORD;
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'INICIANDO SUÍTE DE TESTES V2: SCORE JUSTO E TEMPO REAL';
  RAISE NOTICE '=====================================================';

  -- 1. Cria cliente de teste
  INSERT INTO public.clients (name, phone, cpf, active)
  VALUES ('Cliente Teste V2', '71988880000', '111.222.333-44', true)
  RETURNING id INTO v_cliente_id;

  INSERT INTO public.emprestimos (cliente_id, valor, data_inicio, data_vencimento, status)
  VALUES (v_cliente_id, 3000.00, CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE + INTERVAL '60 days', 'ativo')
  RETURNING id INTO v_emp_id;

  -- ----------------------------------------------------------------------------
  -- TESTE 1: Múltiplos pagamentos em dia seguidos -> Bônus de Streak Progressivo
  -- ----------------------------------------------------------------------------
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '90 days', 'pago')
  RETURNING id INTO v_pag_id_1;

  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '60 days', 'pago')
  RETURNING id INTO v_pag_id_2;

  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 1] 2 Pagamentos em dia -> Streak: % (esp: 2), Maior Streak: %, Score: %',
    v_c.streak_atual, v_c.maior_streak, v_c.score_risco;
  ASSERT v_c.streak_atual = 2, 'Streak atual deveria ser 2';
  ASSERT v_c.score_risco > 100, 'Score deveria ter subido com bônus de streak';

  -- ----------------------------------------------------------------------------
  -- TESTE 2: Pagamento com atraso de 2 dias (Dentro da tolerância de 3 dias)
  -- Não deve contar como atraso e deve MANTER/AVANÇAR o streak para 3!
  -- ----------------------------------------------------------------------------
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '28 days', 'pago')
  RETURNING id INTO v_pag_id_3;

  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 2] Tolerância 2 dias -> Atrasados: % (esp: 0), Streak: % (esp: 3), Score: %',
    v_c.qtd_pagamentos_atrasados, v_c.streak_atual, v_c.score_risco;
  ASSERT v_c.qtd_pagamentos_atrasados = 0, 'Atraso de 2 dias NÃO deve contar como atrasado';
  ASSERT v_c.streak_atual = 3, 'Streak deve avançar para 3 dentro da tolerância';

  -- ----------------------------------------------------------------------------
  -- TESTE 3: Pagamento com atraso acima da tolerância (10 dias) -> Reseta streak
  -- Excedente: 10 - 3 = 7 dias
  -- ----------------------------------------------------------------------------
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '5 days', 'pago')
  RETURNING id INTO v_pag_id_4;

  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 3] Atraso 10 dias -> Streak: % (esp: 0), Maior Streak: % (esp: 3), Atrasados: % (esp: 1), Excedente: % (esp: 7)',
    v_c.streak_atual, v_c.maior_streak, v_c.qtd_pagamentos_atrasados, v_c.dias_atraso_excedente_acumulado;
  ASSERT v_c.streak_atual = 0, 'Streak deve ser resetado para 0 em atraso > 3 dias';
  ASSERT v_c.maior_streak = 3, 'Maior streak deve ser preservado em 3';
  ASSERT v_c.qtd_pagamentos_atrasados = 1, 'Atrasados deve ser 1';
  ASSERT v_c.dias_atraso_excedente_acumulado = 7, 'Excedente acumulado deve ser 7 (10 - 3)';

  -- ----------------------------------------------------------------------------
  -- TESTE 4: Deleção de Pagamento -> Trigger aciona Reconciliação Escopada
  -- ----------------------------------------------------------------------------
  DELETE FROM public.pagamentos WHERE id = v_pag_id_4;

  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 4] Após DELETE -> Total: % (esp: 3), Atrasados: % (esp: 0), Streak: % (esp: 3)',
    v_c.qtd_pagamentos_total, v_c.qtd_pagamentos_atrasados, v_c.streak_atual;
  ASSERT v_c.qtd_pagamentos_total = 3, 'Total deve voltar para 3';
  ASSERT v_c.qtd_pagamentos_atrasados = 0, 'Atrasados deve voltar para 0';
  ASSERT v_c.streak_atual = 3, 'Streak deve ser recalculado corretamente para 3';

  -- ----------------------------------------------------------------------------
  -- TESTE 5: Pagamento Retroativo (Fora de Ordem)
  -- Inserir parcela com vencimento há 100 dias (anterior ao último processado)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '100 days', CURRENT_DATE - INTERVAL '100 days', 'pago');

  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 5] Parcela Retroativa -> Total: % (esp: 4), Streak: % (esp: 4)',
    v_c.qtd_pagamentos_total, v_c.streak_atual;
  ASSERT v_c.qtd_pagamentos_total = 4, 'Total de pagamentos deve ser 4';
  ASSERT v_c.streak_atual = 4, 'Cronologia reconstruída deve calcular streak = 4';

  -- ----------------------------------------------------------------------------
  -- TESTE 6: Parcela Vencida em Aberto -> View vw_clientes_score penaliza em tempo real
  -- ----------------------------------------------------------------------------
  -- Insere uma parcela vencida há 16 dias que NÃO FOI PAGA (data_pagamento IS NULL)
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_cliente_id, 300.00, CURRENT_DATE - INTERVAL '16 days', NULL, 'pendente');

  SELECT * INTO v_view FROM public.vw_clientes_score WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 6] View Tempo Real -> Score Histórico: %, Score Tempo Real: % (deve ser menor)',
    v_view.score_risco, v_view.score_tempo_real;
  ASSERT v_view.score_tempo_real < v_view.score_risco, 'Score tempo real deve ser menor que o score historico devido a divida ativa';

  -- ----------------------------------------------------------------------------
  -- TESTE 7: Reconciliação Geral (fn_reconciliar_scores_todos)
  -- ----------------------------------------------------------------------------
  PERFORM public.fn_reconciliar_scores_todos();
  SELECT * INTO v_c FROM public.clients WHERE id = v_cliente_id;
  RAISE NOTICE '[TESTE 7] Reconciliação Geral executada com sucesso. Score: %', v_c.score_risco;

  -- Limpeza do teste
  DELETE FROM public.clients WHERE id = v_cliente_id;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'TODOS OS TESTES V2 FORAM CONCLUÍDOS COM 100%% DE SUCESSO!';
  RAISE NOTICE '=====================================================';
END $$;
