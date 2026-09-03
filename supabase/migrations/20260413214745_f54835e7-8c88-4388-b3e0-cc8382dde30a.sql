-- Tabela de dados do locador (1 por owner)
CREATE TABLE public.locador_info (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  rg text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  nacionalidade text NOT NULL DEFAULT 'Brasileiro(a)',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.locador_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locador_info"
  ON public.locador_info FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert locador_info"
  ON public.locador_info FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update locador_info"
  ON public.locador_info FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete locador_info"
  ON public.locador_info FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_locador_info_updated_at
  BEFORE UPDATE ON public.locador_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de registro de veículos
CREATE TABLE public.vehicle_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  marca_modelo text NOT NULL DEFAULT '',
  ano text NOT NULL DEFAULT '',
  cor text NOT NULL DEFAULT '',
  placa text NOT NULL DEFAULT '',
  renavam text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vehicle_registry"
  ON public.vehicle_registry FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert vehicle_registry"
  ON public.vehicle_registry FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update vehicle_registry"
  ON public.vehicle_registry FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete vehicle_registry"
  ON public.vehicle_registry FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_vehicle_registry_updated_at
  BEFORE UPDATE ON public.vehicle_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();