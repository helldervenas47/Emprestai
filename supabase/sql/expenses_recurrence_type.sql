-- Corrige a causa raiz das despesas que NÃO eram salvas no banco externo:
-- o app envia `recurrence_type` no insert de `expenses`, mas a coluna não existe
-- no projeto externo → PostgREST retorna 400 / PGRST204
-- ("Could not find the 'recurrence_type' column of 'expenses' in the schema cache")
-- e nenhum registro é persistido.
--
-- Rode este script no SQL Editor do projeto externo (syyxnqzxqabeuqbuptkh).

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_recurrence_type_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_recurrence_type_check
  CHECK (recurrence_type IN ('standard', 'after_payment'));

-- Garante acesso via Data API (PostgREST) para os papéis usados pelo app.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

-- Recarrega o schema cache do PostgREST imediatamente.
NOTIFY pgrst, 'reload schema';
