-- ============================================================================
-- Blindagem: loans.borrower_id → uuid NOT NULL + FK para clients(id)
-- ----------------------------------------------------------------------------
-- Pré-requisito: backfill já rodado (0 loans com borrower_id NULL).
-- ============================================================================

-- 1) Sanity checks.
DO $$
DECLARE
  pendentes int;
  invalidos int;
  orfaos    int;
BEGIN
  SELECT COUNT(*) INTO pendentes FROM public.loans WHERE borrower_id IS NULL;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Ainda existem % loans sem borrower_id.', pendentes;
  END IF;

  SELECT COUNT(*) INTO invalidos
  FROM public.loans
  WHERE borrower_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF invalidos > 0 THEN
    RAISE EXCEPTION '% loans com borrower_id que não é UUID válido.', invalidos;
  END IF;

  SELECT COUNT(*) INTO orfaos
  FROM public.loans l
  LEFT JOIN public.clients c ON c.id = l.borrower_id::uuid
  WHERE c.id IS NULL;
  IF orfaos > 0 THEN
    RAISE EXCEPTION '% loans apontam para clients.id inexistente.', orfaos;
  END IF;
END $$;

BEGIN;

-- 2) Converte a coluna de text para uuid.
ALTER TABLE public.loans
  ALTER COLUMN borrower_id TYPE uuid USING borrower_id::uuid;

-- 3) NOT NULL.
ALTER TABLE public.loans
  ALTER COLUMN borrower_id SET NOT NULL;

-- 4) FK (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loans_borrower_id_fkey'
      AND conrelid = 'public.loans'::regclass
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_borrower_id_fkey
      FOREIGN KEY (borrower_id) REFERENCES public.clients(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 5) Índice.
CREATE INDEX IF NOT EXISTS loans_borrower_id_idx
  ON public.loans (borrower_id);

COMMIT;

-- Verificação final.
SELECT
  COUNT(*)                                        AS total_loans,
  COUNT(*) FILTER (WHERE borrower_id IS NOT NULL) AS com_borrower_id,
  pg_typeof(borrower_id)                          AS tipo_coluna
FROM public.loans
GROUP BY pg_typeof(borrower_id);
