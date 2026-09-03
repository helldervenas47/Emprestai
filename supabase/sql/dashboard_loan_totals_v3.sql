-- =====================================================================
-- Dashboard · Cards de Empréstimos — RPC agregada (V3)
--
-- MUDANÇAS EM RELAÇÃO À V2 (dashboard_loan_totals_v2.sql):
--   1. Juros recebidos NÃO usam mais rateio simplificado pela taxa do
--      contrato. A RPC reproduz a alocação oficial do app
--      (src/features/financial/lib/interestAllocation.ts →
--       allocateInterestByPayment), incluindo:
--        · interest_amount / principal_amount persistidos em metadata;
--        · metadata.allocation_version = 'remaining_balance_prorata';
--        · juros avulsos (installment_number 0 e -2) = 100% juros;
--        · amortização (-3) = 0% juros;
--        · parcial (-1) legado = "juros primeiro";
--        · parcela regular = juros do cronograma real, com cap no saldo
--          de juros remanescente;
--        · contrato de parcela única = excedente sobre o principal;
--        · reconciliação final dos contratos quitados (payoff/desconto).
--      Nenhum pagamento histórico é recalculado ou alterado no banco.
--   2. Fuso: todas as datas de referência (atraso, multas diárias) usam
--      UMA única data calculada em America/Sao_Paulo (ou o fuso do dono
--      dos dados em account_settings.timezone, quando existir).
--   3. Novos campos explícitos: juros_contratados, juros_pendentes e
--      juros_receber_spec — sem alterar o significado de juros_receber
--      (que continua sendo a regra oficial hoje exibida no card).
--   4. Nova RPC de diagnóstico por contrato: dashboard_loan_totals_by_loan.
--
-- Segurança: SECURITY DEFINER + search_path fixo. Escopo obrigatório por
-- public.get_data_owner_id(auth.uid()) — nunca por parâmetro do cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Data de referência única (fuso do app)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_reference_date(_owner uuid DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text := 'America/Sao_Paulo';
  _found text;
BEGIN
  IF _owner IS NOT NULL AND to_regclass('public.account_settings') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT timezone FROM public.account_settings WHERE user_id = $1 LIMIT 1'
        INTO _found USING _owner;
      IF _found IS NOT NULL AND length(_found) > 0 THEN
        _tz := _found;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _tz := 'America/Sao_Paulo';
    END;
  END IF;

  BEGIN
    RETURN (now() AT TIME ZONE _tz)::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.app_reference_date(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_reference_date(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Cronograma de parcelas (paridade: buildInstallmentBreakdown)
--    Retorna jsonb: [{"n":1,"amount":..,"interest":..,"principal":..}, ...]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loan_installment_breakdown(
  _principal numeric,
  _rate      numeric,
  _n         integer,
  _amounts   numeric[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _p numeric := GREATEST(COALESCE(_principal, 0), 0);
  _count int := GREATEST(COALESCE(_n, 1), 1);
  _raw_total numeric := ROUND(_p * (1 + COALESCE(_rate, 0) / 100.0));
  _has_custom boolean := _amounts IS NOT NULL AND array_length(_amounts, 1) = _count;
  _amt numeric;
  _amts numeric[];
  _sum numeric := 0;
  _total numeric;
  _total_interest numeric;
  _i int;
  _share numeric;
  _interest numeric;
  _principal_part numeric;
  _acc_i numeric := 0;
  _acc_p numeric := 0;
  _out jsonb := '[]'::jsonb;
BEGIN
  IF _count = 1 THEN
    _amt := COALESCE(CASE WHEN _has_custom THEN _amounts[1] END, _raw_total);
    -- Excedente sobre o contratado (multa de renegociação acordada) também é juros.
    _total_interest := GREATEST(0, GREATEST(_raw_total, _amt) - _p);
    RETURN jsonb_build_array(jsonb_build_object(
      'n', 1,
      'amount', ROUND(_amt, 2),
      'interest', ROUND(_total_interest, 2),
      'principal', ROUND(_amt - _total_interest, 2)
    ));
  END IF;

  IF _has_custom THEN
    _amts := ARRAY(SELECT ROUND(COALESCE(x, 0), 2) FROM unnest(_amounts) AS x);
  ELSE
    _amts := ARRAY(SELECT ROUND(_raw_total / _count, 2) FROM generate_series(1, _count));
  END IF;

  SELECT COALESCE(SUM(x), 0) INTO _sum FROM unnest(_amts) AS x;
  _total := CASE WHEN _has_custom THEN GREATEST(_raw_total, _sum) ELSE _raw_total END;
  _total_interest := GREATEST(0, _total - _p);

  FOR _i IN 1.._count LOOP
    IF _i < _count THEN
      _share := CASE WHEN _sum > 0 THEN _amts[_i] / _sum ELSE 1.0 / _count END;
      _interest := ROUND(_total_interest * _share, 2);
      _principal_part := ROUND(_amts[_i] - _interest, 2);
      _acc_i := _acc_i + _interest;
      _acc_p := _acc_p + _principal_part;
      _out := _out || jsonb_build_object('n', _i, 'amount', _amts[_i],
        'interest', _interest, 'principal', _principal_part);
    ELSE
      _interest := GREATEST(0, ROUND(_total_interest - _acc_i, 2));
      _principal_part := GREATEST(0, ROUND(_p - _acc_p, 2));
      _amt := ROUND(_interest + _principal_part, 2);
      _out := _out || jsonb_build_object('n', _i,
        'amount', CASE WHEN _amt <> 0 THEN _amt ELSE _amts[_i] END,
        'interest', _interest, 'principal', _principal_part);
    END IF;
  END LOOP;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.loan_installment_breakdown(numeric, numeric, integer, numeric[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loan_installment_breakdown(numeric, numeric, integer, numeric[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Alocação oficial de juros por pagamento
--    Paridade 1:1 com allocateInterestByPayment (TS).
--    Somente leitura — não grava nada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loan_interest_allocation(_owner uuid)
RETURNS TABLE(
  payment_id  uuid,
  loan_id     uuid,
  pay_date    date,
  amount      numeric,
  interest    numeric,
  principal   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loan record;
  _pay  record;
  _sched            jsonb := '{}'::jsonb;  -- loan_id -> breakdown (só parcelados)
  _int_rem          jsonb := '{}'::jsonb;  -- loan_id -> saldo de juros
  _prior_principal  jsonb := '{}'::jsonb;  -- loan_id -> principal histórico (parcela única)
  _alloc            jsonb := '{}'::jsonb;  -- payment_id -> juros
  _key text;
  _amts numeric[];
  _total numeric;
  _n int;
  _entry jsonb;
  _interest numeric;
  _rem numeric;
  _persisted numeric;
  _persisted_principal numeric;
  _version text;
  _valid boolean;
  _principal_remaining numeric;
  _principal_part numeric;
  _scheduled_interest numeric;
  _expected numeric;
  _allocated numeric;
  _diff numeric;
  _last_id uuid;
  _last_amount numeric;
  _cur numeric;
  _cap numeric;
BEGIN
  IF _owner IS NULL THEN
    RETURN;
  END IF;

  -- 2.1 Estado inicial por contrato + cronograma real (com valores pagos)
  FOR _loan IN
    SELECT l.id,
           COALESCE(l.amount, 0)::numeric        AS amount,
           COALESCE(l.interest_rate, 0)::numeric AS rate,
           GREATEST(COALESCE(l.installments, 1), 1) AS installments,
           l.status
    FROM public.loans l
    WHERE l.user_id = _owner
  LOOP
    _key := _loan.id::text;
    _total := ROUND(_loan.amount * (1 + _loan.rate / 100.0));
    _int_rem := jsonb_set(_int_rem, ARRAY[_key],
      to_jsonb(GREATEST(0, _total - _loan.amount)));

    IF _loan.installments > 1 THEN
      _n := _loan.installments;
      _amts := ARRAY(SELECT ROUND(_total / _n, 2) FROM generate_series(1, _n));
      -- Sobrescreve com os valores realmente pagos em cada parcela
      FOR _pay IN
        SELECT p.installment_number AS k, COALESCE(p.amount, 0)::numeric AS amt
        FROM public.payments p
        WHERE p.loan_id = _loan.id
          AND p.installment_number BETWEEN 1 AND _n
        ORDER BY p.date, p.created_at, p.id
      LOOP
        _amts[_pay.k] := ROUND(_pay.amt, 2);
      END LOOP;

      _entry := public.loan_installment_breakdown(_loan.amount, _loan.rate, _n, _amts);
      _sched := jsonb_set(_sched, ARRAY[_key], _entry);

      SELECT COALESCE(SUM((e->>'interest')::numeric), 0) INTO _scheduled_interest
      FROM jsonb_array_elements(_entry) e;

      _int_rem := jsonb_set(_int_rem, ARRAY[_key], to_jsonb(
        GREATEST(COALESCE((_int_rem->>_key)::numeric, 0), _scheduled_interest)
      ));
    END IF;
  END LOOP;

  -- 2.2 Loop determinístico dos pagamentos (data → created_at → id)
  FOR _pay IN
    SELECT p.id,
           p.loan_id,
           COALESCE(p.amount, 0)::numeric AS amt,
           COALESCE(p.installment_number, 0) AS inst,
           p.metadata,
           l.amount::numeric  AS loan_amount,
           l.interest_rate::numeric AS loan_rate,
           GREATEST(COALESCE(l.installments, 1), 1) AS loan_installments
    FROM public.payments p
    JOIN public.loans l ON l.id = p.loan_id
    WHERE l.user_id = _owner
    ORDER BY p.date, p.created_at, p.id
  LOOP
    _key := _pay.loan_id::text;
    _interest := 0;

    IF _pay.amt <= 0 THEN
      _alloc := jsonb_set(_alloc, ARRAY[_pay.id::text], to_jsonb(0::numeric));
      CONTINUE;
    END IF;

    -- Juros avulsos: 100% juros
    IF _pay.inst = 0 OR _pay.inst = -2 THEN
      _interest := ROUND(_pay.amt, 2);
      _rem := COALESCE((_int_rem->>_key)::numeric, 0);
      _int_rem := jsonb_set(_int_rem, ARRAY[_key], to_jsonb(GREATEST(0, _rem - _pay.amt)));
      _alloc := jsonb_set(_alloc, ARRAY[_pay.id::text], to_jsonb(_interest));
      CONTINUE;
    END IF;

    -- Amortização: 0% juros
    IF _pay.inst = -3 THEN
      _alloc := jsonb_set(_alloc, ARRAY[_pay.id::text], to_jsonb(0::numeric));
      CONTINUE;
    END IF;

    -- Pagamento parcial (-1)
    IF _pay.inst = -1 THEN
      _rem := COALESCE((_int_rem->>_key)::numeric, 0);
      _persisted := NULLIF(_pay.metadata->>'interest_amount', '')::numeric;
      _persisted_principal := NULLIF(_pay.metadata->>'principal_amount', '')::numeric;
      _version := _pay.metadata->>'allocation_version';

      IF _version = 'remaining_balance_prorata' THEN
        _valid := _persisted IS NOT NULL
              AND _persisted >= 0
              AND _persisted_principal IS NOT NULL
              AND _persisted_principal >= -0.005
              AND ABS((_persisted + _persisted_principal) - _pay.amt) <= 0.01;
        IF _valid THEN
          _interest := LEAST(ROUND(_persisted, 2), _pay.amt);
        ELSE
          -- Integridade violada: mesma decisão do frontend — cai no legado.
          _interest := ROUND(LEAST(_rem, _pay.amt), 2);
        END IF;
      ELSIF _persisted IS NOT NULL AND _persisted >= 0 THEN
        _interest := LEAST(ROUND(_persisted, 2), _pay.amt);
      ELSE
        _interest := ROUND(LEAST(_rem, _pay.amt), 2);
      END IF;

      _int_rem := jsonb_set(_int_rem, ARRAY[_key], to_jsonb(GREATEST(0, ROUND(_rem - _interest, 2))));
      _alloc := jsonb_set(_alloc, ARRAY[_pay.id::text], to_jsonb(_interest));
      CONTINUE;
    END IF;

    -- Parcela regular
    _rem := COALESCE((_int_rem->>_key)::numeric, 0);
    IF _pay.loan_installments > 1 AND _sched ? _key THEN
      SELECT e INTO _entry
      FROM jsonb_array_elements(_sched->_key) e
      WHERE (e->>'n')::int = _pay.inst
      LIMIT 1;
      IF _entry IS NULL THEN
        SELECT e INTO _entry
        FROM jsonb_array_elements(_sched->_key) e
        ORDER BY (e->>'n')::int DESC
        LIMIT 1;
      END IF;
      _interest := GREATEST(0, LEAST(ROUND((_entry->>'interest')::numeric, 2), _pay.amt, _rem));
    ELSE
      -- Parcela única: excedente sobre o principal remanescente é juros.
      _principal_remaining := GREATEST(0, ROUND(
        COALESCE(_pay.loan_amount, 0) - COALESCE((_prior_principal->>_key)::numeric, 0), 2));
      _principal_part := LEAST(_pay.amt, _principal_remaining);
      _interest := GREATEST(0, ROUND(_pay.amt - _principal_part, 2));
    END IF;

    _int_rem := jsonb_set(_int_rem, ARRAY[_key], to_jsonb(GREATEST(0, _rem - _interest)));
    _prior_principal := jsonb_set(_prior_principal, ARRAY[_key], to_jsonb(
      COALESCE((_prior_principal->>_key)::numeric, 0) + GREATEST(0, ROUND(_pay.amt - _interest, 2))
    ));
    _alloc := jsonb_set(_alloc, ARRAY[_pay.id::text], to_jsonb(_interest));
    _entry := NULL;
  END LOOP;

  -- 2.3 Reconciliação dos contratos quitados (payoff de várias parcelas,
  --     resíduo de arredondamento, multa diluída).
  FOR _loan IN
    SELECT l.id,
           COALESCE(l.amount, 0)::numeric        AS amount,
           COALESCE(l.interest_rate, 0)::numeric AS rate
    FROM public.loans l
    WHERE l.user_id = _owner AND l.status = 'paid'
  LOOP
    _key := _loan.id::text;
    SELECT p.id, COALESCE(p.amount, 0)::numeric
      INTO _last_id, _last_amount
    FROM public.payments p
    WHERE p.loan_id = _loan.id
    ORDER BY p.date DESC, p.created_at DESC, p.id DESC
    LIMIT 1;
    CONTINUE WHEN _last_id IS NULL;

    _total := ROUND(_loan.amount * (1 + _loan.rate / 100.0));
    _scheduled_interest := 0;
    IF _sched ? _key THEN
      SELECT COALESCE(SUM((e->>'interest')::numeric), 0) INTO _scheduled_interest
      FROM jsonb_array_elements(_sched->_key) e;
    END IF;
    _expected := GREATEST(0, GREATEST(_total - _loan.amount, _scheduled_interest));

    SELECT COALESCE(SUM(COALESCE((_alloc->>p.id::text)::numeric, 0)), 0)
      INTO _allocated
    FROM public.payments p
    WHERE p.loan_id = _loan.id;

    _diff := ROUND(_expected - _allocated, 2);
    CONTINUE WHEN _diff <= 0;

    _cur := COALESCE((_alloc->>_last_id::text)::numeric, 0);
    _cap := GREATEST(0, ROUND(_last_amount - _cur, 2));
    IF LEAST(_diff, _cap) > 0 THEN
      _alloc := jsonb_set(_alloc, ARRAY[_last_id::text],
        to_jsonb(ROUND(_cur + LEAST(_diff, _cap), 2)));
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT p.id,
         p.loan_id,
         p.date,
         COALESCE(p.amount, 0)::numeric,
         COALESCE((_alloc->>p.id::text)::numeric, 0),
         GREATEST(0, ROUND(COALESCE(p.amount, 0) - COALESCE((_alloc->>p.id::text)::numeric, 0), 2))
  FROM public.payments p
  JOIN public.loans l ON l.id = p.loan_id
  WHERE l.user_id = _owner;
END;
$$;

REVOKE ALL ON FUNCTION public.loan_interest_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loan_interest_allocation(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Métricas por contrato (base compartilhada entre o agregado e o
--    diagnóstico por contrato).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_loan_metrics(
  _start date,
  _end   date
)
RETURNS TABLE(
  loan_id              uuid,
  status               text,
  start_date           date,
  reference_date       date,
  emprestado           numeric,
  capital_ativo        numeric,
  base_remaining       numeric,
  multas               numeric,
  receber              numeric,
  juros_contratados    numeric,
  juros_recebidos_total numeric,
  juros_pendentes      numeric,
  recebido_periodo     numeric,
  juros_recebidos      numeric,
  principal_recebido   numeric,
  days_overdue         integer,
  installments         integer,
  interest_rate        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _today date;
BEGIN
  _owner := public.get_data_owner_id(auth.uid());
  IF _owner IS NULL THEN
    RETURN;
  END IF;
  _today := public.app_reference_date(_owner);

  RETURN QUERY
  WITH l AS (
    SELECT
      lo.id,
      COALESCE(lo.amount, 0)::numeric                AS amount,
      COALESCE(lo.interest_rate, 0)::numeric         AS interest_rate,
      GREATEST(COALESCE(lo.installments, 1), 1)      AS installments,
      COALESCE(lo.paid_installments, 0)              AS paid_installments,
      lo.status,
      lo.start_date,
      lo.due_date,
      COALESCE(lo.remaining_amount, 0)::numeric      AS remaining_amount,
      lo.late_interest_type,
      COALESCE(lo.late_interest_value, 0)::numeric   AS late_interest_value,
      COALESCE(lo.penalty_value, 0)::numeric         AS penalty_value,
      COALESCE(lo.renegotiation_penalty_total, 0)::numeric AS reneg_penalty
    FROM public.loans lo
    WHERE lo.user_id = _owner
  ),
  alloc AS (
    SELECT * FROM public.loan_interest_allocation(_owner)
  ),
  paid_by_loan AS (
    SELECT a.loan_id, COALESCE(SUM(a.amount), 0)::numeric AS total_paid,
           COALESCE(SUM(a.interest), 0)::numeric          AS interest_paid
    FROM alloc a
    GROUP BY a.loan_id
  ),
  period_by_loan AS (
    SELECT a.loan_id,
           COALESCE(SUM(a.amount), 0)::numeric    AS recebido,
           COALESCE(SUM(a.interest), 0)::numeric  AS juros,
           COALESCE(SUM(a.principal), 0)::numeric AS principal
    FROM alloc a
    WHERE a.pay_date >= _start AND a.pay_date <= _end
    GROUP BY a.loan_id
  ),
  unpaid_sched AS (
    SELECT li.loan_id, COALESCE(SUM(li.amount), 0)::numeric AS unpaid_total
    FROM public.loan_installments li
    JOIN l ON l.id = li.loan_id
    WHERE li.installment_number > l.paid_installments
    GROUP BY li.loan_id
  ),
  first_pending AS (
    SELECT l.id AS loan_id,
      COALESCE(
        (SELECT li.due_date FROM public.loan_installments li
          WHERE li.loan_id = l.id
            AND li.installment_number = l.paid_installments + 1
          LIMIT 1),
        l.due_date
      ) AS due_date
    FROM l
  ),
  base AS (
    SELECT
      l.*,
      COALESCE(pb.total_paid, 0)     AS total_paid,
      COALESCE(pb.interest_paid, 0)  AS interest_paid,
      COALESCE(pl.recebido, 0)       AS recebido_periodo,
      COALESCE(pl.juros, 0)          AS juros_periodo,
      COALESCE(pl.principal, 0)      AS principal_periodo,
      fp.due_date AS pending_due_date,
      CASE
        WHEN l.remaining_amount > 0 THEN l.remaining_amount
        WHEN l.installments >= 2 AND COALESCE(us.unpaid_total, 0) > 0 THEN us.unpaid_total
        ELSE GREATEST(0, ROUND(l.amount * (1 + l.interest_rate / 100.0)) - COALESCE(pb.total_paid, 0))
      END AS base_remaining,
      -- Juros contratados: do cronograma real (inclui multa diluída)
      (SELECT COALESCE(SUM((e->>'interest')::numeric), 0)
         FROM jsonb_array_elements(
           public.loan_installment_breakdown(l.amount, l.interest_rate, l.installments, NULL)
         ) e) AS juros_contratados
    FROM l
    LEFT JOIN paid_by_loan pb ON pb.loan_id = l.id
    LEFT JOIN period_by_loan pl ON pl.loan_id = l.id
    LEFT JOIN unpaid_sched  us ON us.loan_id = l.id
    LEFT JOIN first_pending fp ON fp.loan_id = l.id
  ),
  calc AS (
    SELECT
      b.*,
      CASE
        WHEN b.status = 'paid' OR b.pending_due_date IS NULL THEN 0
        ELSE GREATEST(0, (_today - b.pending_due_date))
      END AS days_overdue
    FROM base b
  ),
  fees AS (
    SELECT
      c.*,
      CASE
        WHEN c.days_overdue > 0 AND c.late_interest_value > 0 THEN
          CASE WHEN c.late_interest_type = 'fixed'
            THEN c.late_interest_value * c.days_overdue
            ELSE c.base_remaining * (c.late_interest_value / 100.0) * c.days_overdue
          END
        ELSE 0
      END
      + CASE WHEN c.days_overdue > 0 AND c.penalty_value > 0 THEN c.penalty_value ELSE 0 END
      + CASE WHEN c.installments < 2 THEN c.reneg_penalty ELSE 0 END AS fees_total
    FROM calc c
  )
  SELECT
    f.id,
    f.status,
    f.start_date,
    _today,
    ROUND(f.amount, 2),
    ROUND(CASE WHEN f.status <> 'paid'
      THEN f.amount * GREATEST(0,
        (f.installments::numeric - LEAST(f.paid_installments, f.installments)::numeric)
        / f.installments::numeric)
      ELSE 0 END, 2),
    ROUND(f.base_remaining, 2),
    ROUND(CASE WHEN f.status <> 'paid' THEN GREATEST(0, f.fees_total) ELSE 0 END, 2),
    ROUND(CASE WHEN f.status <> 'paid' THEN GREATEST(0, f.base_remaining + f.fees_total) ELSE 0 END, 2),
    ROUND(f.juros_contratados, 2),
    ROUND(f.interest_paid, 2),
    ROUND(CASE WHEN f.status <> 'paid'
      THEN GREATEST(0, f.juros_contratados - f.interest_paid) ELSE 0 END, 2),
    ROUND(f.recebido_periodo, 2),
    ROUND(f.juros_periodo, 2),
    ROUND(f.principal_periodo, 2),
    f.days_overdue,
    f.installments,
    f.interest_rate
  FROM fees f;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_metrics(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_metrics(date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Agregado do Dashboard (substitui a V2 mantendo os mesmos nomes de
--    campo + campos novos ao final; o layout dos cards não muda).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_loan_totals(date, date);

CREATE OR REPLACE FUNCTION public.dashboard_loan_totals(
  _start date,
  _end   date
)
RETURNS TABLE(
  owner_id                uuid,
  emprestado              numeric,
  emprestado_total        numeric,
  receber                 numeric,
  principal_recebido      numeric,
  juros_recebidos         numeric,
  juros_receber           numeric,  -- REGRA OFICIAL ATUAL: receber - capital_ativo
  multas_pendentes        numeric,
  capital_ativo           numeric,
  total_recebido_periodo  numeric,
  quantidade_contratos    bigint,
  contratos_ativos        bigint,
  contratos_quitados      bigint,
  contratos_parcelados    bigint,
  contratos_atrasados     bigint,
  taxa_juros_media        numeric,
  -- Campos NOVOS (não alteram nenhum card existente)
  juros_contratados       numeric,  -- Σ juros do cronograma (contratos ativos)
  juros_pendentes         numeric,  -- juros_contratados - juros já recebidos
  juros_receber_spec      numeric,  -- receber - Σ amount dos contratos ativos
  reference_date          date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_data_owner_id(auth.uid());
  IF _owner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT * FROM public.dashboard_loan_metrics(_start, _end)
  )
  SELECT
    _owner,
    ROUND(COALESCE(SUM(m.emprestado) FILTER (
      WHERE m.start_date >= _start AND m.start_date <= _end), 0), 2),
    ROUND(COALESCE(SUM(m.emprestado), 0), 2),
    ROUND(COALESCE(SUM(m.receber), 0), 2),
    ROUND(COALESCE(SUM(m.principal_recebido), 0), 2),
    ROUND(COALESCE(SUM(m.juros_recebidos), 0), 2),
    ROUND(GREATEST(0, COALESCE(SUM(m.receber), 0) - COALESCE(SUM(m.capital_ativo), 0)), 2),
    ROUND(COALESCE(SUM(m.multas), 0), 2),
    ROUND(COALESCE(SUM(m.capital_ativo), 0), 2),
    ROUND(COALESCE(SUM(m.recebido_periodo), 0), 2),
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE m.status <> 'paid')::bigint,
    COUNT(*) FILTER (WHERE m.status = 'paid')::bigint,
    COUNT(*) FILTER (WHERE m.installments >= 2)::bigint,
    COUNT(*) FILTER (WHERE m.status <> 'paid' AND m.days_overdue > 0)::bigint,
    CASE
      WHEN COALESCE(SUM(m.emprestado) FILTER (WHERE m.interest_rate > 0), 0) > 0
        THEN ROUND(
          SUM(m.emprestado * m.interest_rate) FILTER (WHERE m.interest_rate > 0)
          / SUM(m.emprestado) FILTER (WHERE m.interest_rate > 0), 4)
      ELSE 0
    END,
    ROUND(COALESCE(SUM(m.juros_contratados) FILTER (WHERE m.status <> 'paid'), 0), 2),
    ROUND(COALESCE(SUM(m.juros_pendentes), 0), 2),
    ROUND(GREATEST(0, COALESCE(SUM(m.receber), 0)
      - COALESCE(SUM(m.emprestado) FILTER (WHERE m.status <> 'paid'), 0)), 2),
    MAX(m.reference_date)
  FROM m;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_totals(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_loan_totals(date, date) IS
  'Dashboard V3: totais agregados dos cards de empréstimos. Juros pela alocação oficial (loan_interest_allocation) e data de referência no fuso do app.';

-- ---------------------------------------------------------------------
-- 5. Diagnóstico POR CONTRATO (modo validação — não usado pelos cards).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_loan_totals_by_loan(
  _start date,
  _end   date
)
RETURNS TABLE(
  loan_id               uuid,
  borrower_name         text,
  status                text,
  emprestado            numeric,
  principal_recebido    numeric,
  juros_recebidos       numeric,
  multas                numeric,
  capital_ativo         numeric,
  receber               numeric,
  juros_contratados     numeric,
  juros_pendentes       numeric,
  reference_date        date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_data_owner_id(auth.uid());
  IF _owner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.loan_id,
    l.borrower_name,
    m.status,
    m.emprestado,
    m.principal_recebido,
    m.juros_recebidos,
    m.multas,
    m.capital_ativo,
    m.receber,
    m.juros_contratados,
    m.juros_pendentes,
    m.reference_date
  FROM public.dashboard_loan_metrics(_start, _end) m
  JOIN public.loans l ON l.id = m.loan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_totals_by_loan(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_totals_by_loan(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_loan_totals_by_loan(date, date) IS
  'Diagnóstico de paridade por contrato (somente leitura). Usado apenas pelo painel de migração em dev/admin/flag.';
