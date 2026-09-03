-- Tabela para armazenar snapshots mensais de patrimônio por usuário/owner,
-- permitindo que a meta "Variação Mensal do Patrimônio" e o card "Variação"
-- funcionem entre dispositivos e sobrevivam a limpezas de localStorage.

CREATE TABLE IF NOT EXISTS public.patrimonio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  month text NOT NULL, -- formato "YYYY-MM"
  account numeric NOT NULL DEFAULT 0,
  rua numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrimonio_snapshots TO authenticated;
GRANT ALL ON public.patrimonio_snapshots TO service_role;

ALTER TABLE public.patrimonio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patrimonio_snapshots_select_own" ON public.patrimonio_snapshots;
CREATE POLICY "patrimonio_snapshots_select_own"
  ON public.patrimonio_snapshots FOR SELECT
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "patrimonio_snapshots_insert_own" ON public.patrimonio_snapshots;
CREATE POLICY "patrimonio_snapshots_insert_own"
  ON public.patrimonio_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "patrimonio_snapshots_update_own" ON public.patrimonio_snapshots;
CREATE POLICY "patrimonio_snapshots_update_own"
  ON public.patrimonio_snapshots FOR UPDATE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "patrimonio_snapshots_delete_own" ON public.patrimonio_snapshots;
CREATE POLICY "patrimonio_snapshots_delete_own"
  ON public.patrimonio_snapshots FOR DELETE
  TO authenticated
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS patrimonio_snapshots_owner_month_idx
  ON public.patrimonio_snapshots (owner_id, month DESC);

-- Trigger para manter updated_at atualizado
DROP TRIGGER IF EXISTS trg_patrimonio_snapshots_updated_at ON public.patrimonio_snapshots;
CREATE TRIGGER trg_patrimonio_snapshots_updated_at
  BEFORE UPDATE ON public.patrimonio_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
