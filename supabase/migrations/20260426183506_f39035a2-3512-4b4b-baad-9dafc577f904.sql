-- Corrige contratos com original_due_date corrompido (posterior ao due_date atual).
-- Esses são casos de bug histórico ou edição manual onde o original ficou desalinhado.
-- A âncora do ciclo de juros nunca pode ser posterior ao próximo vencimento.
UPDATE public.loans
SET original_due_date = due_date
WHERE original_due_date IS NOT NULL
  AND original_due_date > due_date;