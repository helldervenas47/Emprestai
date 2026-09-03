-- Tabela de simulações de empréstimo
CREATE TABLE public.loan_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name TEXT,
  notes TEXT,
  scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_scenario_id TEXT,
  simulation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_simulations_owner ON public.loan_simulations(owner_id);
CREATE INDEX idx_loan_simulations_client ON public.loan_simulations(client_id);
CREATE INDEX idx_loan_simulations_date ON public.loan_simulations(simulation_date DESC);

ALTER TABLE public.loan_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their simulations"
ON public.loan_simulations FOR SELECT
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can create their simulations"
ON public.loan_simulations FOR INSERT
WITH CHECK (
  owner_id = public.get_data_owner_id(auth.uid())
  AND public.can_write_data(auth.uid())
);

CREATE POLICY "Users can update their simulations"
ON public.loan_simulations FOR UPDATE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete their simulations"
ON public.loan_simulations FOR DELETE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_loan_simulations_updated_at
BEFORE UPDATE ON public.loan_simulations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de configurações da simulação
CREATE TABLE public.simulation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.simulation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their simulation settings"
ON public.simulation_settings FOR SELECT
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert their simulation settings"
ON public.simulation_settings FOR INSERT
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update their simulation settings"
ON public.simulation_settings FOR UPDATE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_simulation_settings_updated_at
BEFORE UPDATE ON public.simulation_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();