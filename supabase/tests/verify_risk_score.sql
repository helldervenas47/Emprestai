-- ==============================================================================
-- Script de Verificação e Testes: Score de Risco Incremental por Cliente
-- ==============================================================================

DO $$
DECLARE
  v_test_client_id UUID;
  v_emp_id UUID;
  v_score_inicial NUMERIC;
  v_score_apos_em_dia NUMERIC;
  v_score_apos_atrasado NUMERIC;
  v_score_reconciliado NUMERIC;
  v_total_pagos INTEGER;
  v_total_atrasados INTEGER;
  v_dias_atraso INTEGER;
BEGIN
  RAISE NOTICE '--- INICIANDO TESTES DO SCORE INCREMENTAL ---';

  -- 1. Cria um cliente de teste
  INSERT INTO public.clients (name, phone, cpf, active)
  VALUES ('Cliente Teste Score Incremental', '71999990000', '000.000.000-99', true)
  RETURNING id, score_risco INTO v_test_client_id, v_score_inicial;

  RAISE NOTICE 'Cliente criado com ID: % e Score Inicial: % (esperado: 100)', v_test_client_id, v_score_inicial;
  ASSERT v_score_inicial = 100.00, 'Score inicial deveria ser 100.00';

  -- 2. Cria um empréstimo de teste
  INSERT INTO public.emprestimos (cliente_id, valor, data_inicio, data_vencimento, status)
  VALUES (v_test_client_id, 1000.00, CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '30 days', 'ativo')
  RETURNING id INTO v_emp_id;

  -- 3. TESTE 1: Inserir pagamento EM DIA (+3 pontos)
  -- Vencimento: 30 dias atrás / Pago: 30 dias atrás (0 dias de atraso)
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_test_client_id, 200.00, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '30 days', 'pago');

  SELECT score_risco, qtd_pagamentos_total, qtd_pagamentos_atrasados, dias_atraso_acumulado
  INTO v_score_apos_em_dia, v_total_pagos, v_total_atrasados, v_dias_atraso
  FROM public.clients WHERE id = v_test_client_id;

  RAISE NOTICE 'Após Pagamento EM DIA -> Score: % (esperado: 103), Total Pagos: %, Atrasados: %',
    v_score_apos_em_dia, v_total_pagos, v_total_atrasados;
  ASSERT v_score_apos_em_dia = 103.00, 'Score deveria subir para 103.00 após pagamento em dia';
  ASSERT v_total_pagos = 1, 'Total de pagamentos deveria ser 1';
  ASSERT v_total_atrasados = 0, 'Total de atrasados deveria ser 0';

  -- 4. TESTE 2: Inserir pagamento ATRASADO (Penalidade: -5 por atraso e -5 por 10 dias de atraso [10 * 0.5])
  -- Vencimento: 20 dias atrás / Pago: 10 dias atrás (10 dias de atraso)
  -- Score esperado: 103 + 0 (não é em dia) - 5 (atraso) - 5 (10 * 0.5) = 93.00
  INSERT INTO public.pagamentos (emprestimo_id, cliente_id, valor, data_vencimento, data_pagamento, status)
  VALUES (v_emp_id, v_test_client_id, 200.00, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '10 days', 'pago');

  SELECT score_risco, qtd_pagamentos_total, qtd_pagamentos_atrasados, dias_atraso_acumulado
  INTO v_score_apos_atrasado, v_total_pagos, v_total_atrasados, v_dias_atraso
  FROM public.clients WHERE id = v_test_client_id;

  RAISE NOTICE 'Após Pagamento ATRASADO -> Score: % (esperado: 93), Total Pagos: %, Atrasados: %, Dias Acumulados: %',
    v_score_apos_atrasado, v_total_pagos, v_total_atrasados, v_dias_atraso;
  ASSERT v_score_apos_atrasado = 93.00, 'Score deveria cair para 93.00';
  ASSERT v_total_pagos = 2, 'Total de pagamentos deveria ser 2';
  ASSERT v_total_atrasados = 1, 'Total de atrasados deveria ser 1';
  ASSERT v_dias_atraso = 10, 'Dias de atraso acumulados deveria ser 10';

  -- 5. TESTE 3: Executar a Reconciliação do Zero e Confirmar que Bate com o Incremental
  PERFORM public.fn_reconciliar_scores(v_test_client_id);

  SELECT score_risco, qtd_pagamentos_total, qtd_pagamentos_atrasados, dias_atraso_acumulado
  INTO v_score_reconciliado, v_total_pagos, v_total_atrasados, v_dias_atraso
  FROM public.clients WHERE id = v_test_client_id;

  RAISE NOTICE 'Após RECONCILIAÇÃO -> Score: % (esperado: 93), Total Pagos: %, Atrasados: %',
    v_score_reconciliado, v_total_pagos, v_total_atrasados;
  ASSERT v_score_reconciliado = v_score_apos_atrasado, 'Score reconciliado deve ser exatamente igual ao incremental';

  -- 6. Limpeza do ambiente de teste
  DELETE FROM public.clients WHERE id = v_test_client_id;

  RAISE NOTICE '--- TODOS OS TESTES PASSARAM COM SUCESSO! ---';
END $$;
