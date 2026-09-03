
-- Cache global de taxas de mercado (CDI etc.)
CREATE TABLE IF NOT EXISTS public.market_rates (
  indicator TEXT PRIMARY KEY,
  annual_rate NUMERIC NOT NULL,
  source TEXT,
  reference_date DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

-- Leitura pública para qualquer usuário autenticado
CREATE POLICY "Market rates readable by authenticated users"
  ON public.market_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- Sem políticas de INSERT/UPDATE/DELETE → só service role (edge function) escreve.

CREATE TRIGGER update_market_rates_updated_at
BEFORE UPDATE ON public.market_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Flag por cofrinho: seguir automaticamente o CDI cacheado
ALTER TABLE public.piggy_banks
  ADD COLUMN IF NOT EXISTS auto_rate BOOLEAN NOT NULL DEFAULT false;
