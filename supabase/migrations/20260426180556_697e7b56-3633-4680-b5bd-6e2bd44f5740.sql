DO $$
DECLARE
  v_user uuid := '333aabf4-4a7a-4cd1-a9f4-d1a714efaccd';
  v_loan uuid;
  v_reneg uuid;
  v_snapshot jsonb;
  v_loan_before jsonb;
  v_loan_after_reneg jsonb;
  v_loan_after_revert jsonb;
  v_inst_before jsonb;
  v_inst_after_reneg jsonb;
  v_inst_after_revert jsonb;
  v_sched jsonb;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Cria contrato de teste + cronograma original (3 parcelas)
  ----------------------------------------------------------------------
  INSERT INTO loans (user_id, borrower_name, amount, remaining_amount, installments,
                     paid_installments, due_date, original_due_date, start_date,
                     payment_type, interest_type, interest_rate,
                     custom_installment_value, renegotiation_penalty_total, status)
  VALUES (v_user, '__TEST_REVERT__', 1000, 1000, 3, 0,
          '2026-05-02', '2026-05-02', '2026-04-02',
          'Parcelado', 'Mensal', 20, 400, 0, 'active')
  RETURNING id INTO v_loan;

  INSERT INTO loan_installments (loan_id, user_id, installment_number, due_date, amount) VALUES
    (v_loan, v_user, 1, '2026-05-02', 400),
    (v_loan, v_user, 2, '2026-06-02', 400),
    (v_loan, v_user, 3, '2026-07-02', 400);

  -- Snapshot do "antes"
  SELECT to_jsonb(l) INTO v_loan_before FROM loans l WHERE id = v_loan;
  SELECT jsonb_agg(jsonb_build_object('n', installment_number, 'd', due_date, 'a', amount) ORDER BY installment_number)
    INTO v_inst_before FROM loan_installments WHERE loan_id = v_loan;

  ----------------------------------------------------------------------
  -- 2) Monta o snapshot (igual ao código TS) e aplica a renegociação
  ----------------------------------------------------------------------
  v_snapshot := jsonb_build_object(
    'version', 1,
    'loan', jsonb_build_object(
      'remaining_amount', (v_loan_before->>'remaining_amount')::numeric,
      'installments',     (v_loan_before->>'installments')::int,
      'custom_installment_value', v_loan_before->'custom_installment_value',
      'renegotiation_penalty_total', (v_loan_before->>'renegotiation_penalty_total')::numeric,
      'due_date', v_loan_before->>'due_date'
    ),
    'schedules', (
      SELECT jsonb_agg(jsonb_build_object(
        'installment_number', installment_number,
        'due_date', due_date,
        'amount', amount
      ) ORDER BY installment_number)
      FROM loan_installments WHERE loan_id = v_loan
    )
  );

  INSERT INTO loan_renegotiations (loan_id, user_id, renegotiated_at, type,
        previous_amount, new_amount, penalty_amount,
        penalty_mode, penalty_input,
        previous_installments, new_installments, notes, previous_state)
  VALUES (v_loan, v_user, '2026-04-26', 'with_penalty',
          1000, 1100, 100,
          'fixed', 100,
          3, 4, '__TEST__', v_snapshot)
  RETURNING id INTO v_reneg;

  -- Aplica mudanças no contrato (simula a renegociação)
  UPDATE loans SET
    remaining_amount = 1100,
    installments = 4,
    custom_installment_value = 275,
    renegotiation_penalty_total = 100,
    due_date = '2026-05-29'
  WHERE id = v_loan;

  -- Reescreve cronograma (4 novas parcelas em datas diferentes)
  DELETE FROM loan_installments WHERE loan_id = v_loan;
  INSERT INTO loan_installments (loan_id, user_id, installment_number, due_date, amount) VALUES
    (v_loan, v_user, 1, '2026-05-29', 275),
    (v_loan, v_user, 2, '2026-06-29', 275),
    (v_loan, v_user, 3, '2026-07-29', 275),
    (v_loan, v_user, 4, '2026-08-29', 275);

  SELECT to_jsonb(l) INTO v_loan_after_reneg FROM loans l WHERE id = v_loan;
  SELECT jsonb_agg(jsonb_build_object('n', installment_number, 'd', due_date, 'a', amount) ORDER BY installment_number)
    INTO v_inst_after_reneg FROM loan_installments WHERE loan_id = v_loan;

  ----------------------------------------------------------------------
  -- 3) REVERTE — replica EXATAMENTE deleteRenegotiation()
  ----------------------------------------------------------------------
  -- 3.1 Reverte campos do contrato
  UPDATE loans SET
    remaining_amount             = (v_snapshot->'loan'->>'remaining_amount')::numeric,
    installments                 = (v_snapshot->'loan'->>'installments')::int,
    custom_installment_value     = NULLIF(v_snapshot->'loan'->>'custom_installment_value', '')::numeric,
    renegotiation_penalty_total  = (v_snapshot->'loan'->>'renegotiation_penalty_total')::numeric,
    due_date                     = v_snapshot->'loan'->>'due_date'
  WHERE id = v_loan;

  -- 3.2 Recria cronograma do snapshot
  DELETE FROM loan_installments WHERE loan_id = v_loan;
  FOR v_sched IN SELECT * FROM jsonb_array_elements(v_snapshot->'schedules') LOOP
    INSERT INTO loan_installments (loan_id, user_id, installment_number, due_date, amount)
    VALUES (
      v_loan, v_user,
      (v_sched->>'installment_number')::int,
      v_sched->>'due_date',
      (v_sched->>'amount')::numeric
    );
  END LOOP;

  -- 3.3 Remove o registro de renegociação
  DELETE FROM loan_renegotiations WHERE id = v_reneg;

  ----------------------------------------------------------------------
  -- 4) Compara DEPOIS-DA-REVERSÃO com ANTES
  ----------------------------------------------------------------------
  SELECT to_jsonb(l) INTO v_loan_after_revert FROM loans l WHERE id = v_loan;
  SELECT jsonb_agg(jsonb_build_object('n', installment_number, 'd', due_date, 'a', amount) ORDER BY installment_number)
    INTO v_inst_after_revert FROM loan_installments WHERE loan_id = v_loan;

  RAISE NOTICE '--- RESULTADO DO TESTE ---';
  RAISE NOTICE 'remaining_amount  before=% afterReneg=% afterRevert=%',
    v_loan_before->>'remaining_amount', v_loan_after_reneg->>'remaining_amount', v_loan_after_revert->>'remaining_amount';
  RAISE NOTICE 'installments      before=% afterReneg=% afterRevert=%',
    v_loan_before->>'installments', v_loan_after_reneg->>'installments', v_loan_after_revert->>'installments';
  RAISE NOTICE 'due_date          before=% afterReneg=% afterRevert=%',
    v_loan_before->>'due_date', v_loan_after_reneg->>'due_date', v_loan_after_revert->>'due_date';
  RAISE NOTICE 'custom_install_v  before=% afterReneg=% afterRevert=%',
    v_loan_before->>'custom_installment_value', v_loan_after_reneg->>'custom_installment_value', v_loan_after_revert->>'custom_installment_value';
  RAISE NOTICE 'penalty_total     before=% afterReneg=% afterRevert=%',
    v_loan_before->>'renegotiation_penalty_total', v_loan_after_reneg->>'renegotiation_penalty_total', v_loan_after_revert->>'renegotiation_penalty_total';
  RAISE NOTICE 'cronograma BEFORE      = %', v_inst_before;
  RAISE NOTICE 'cronograma AFTER RENEG = %', v_inst_after_reneg;
  RAISE NOTICE 'cronograma AFTER REVERT= %', v_inst_after_revert;

  IF (v_loan_before->>'remaining_amount') = (v_loan_after_revert->>'remaining_amount')
     AND (v_loan_before->>'installments') = (v_loan_after_revert->>'installments')
     AND (v_loan_before->>'due_date') = (v_loan_after_revert->>'due_date')
     AND COALESCE(v_loan_before->>'custom_installment_value','') = COALESCE(v_loan_after_revert->>'custom_installment_value','')
     AND (v_loan_before->>'renegotiation_penalty_total') = (v_loan_after_revert->>'renegotiation_penalty_total')
     AND v_inst_before::text = v_inst_after_revert::text THEN
    RAISE NOTICE '✅ SUCESSO: contrato e cronograma 100%% idênticos ao estado original';
  ELSE
    RAISE EXCEPTION '❌ FALHA: estado revertido difere do original';
  END IF;

  ----------------------------------------------------------------------
  -- 5) Cleanup do contrato de teste
  ----------------------------------------------------------------------
  DELETE FROM loan_installments WHERE loan_id = v_loan;
  DELETE FROM loans WHERE id = v_loan;
END $$;