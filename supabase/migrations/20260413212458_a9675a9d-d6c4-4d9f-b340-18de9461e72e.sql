
ALTER TABLE public.clients
ADD COLUMN nacionalidade text NOT NULL DEFAULT '',
ADD COLUMN estado_civil text NOT NULL DEFAULT '',
ADD COLUMN profissao text NOT NULL DEFAULT '',
ADD COLUMN bairro text NOT NULL DEFAULT '',
ADD COLUMN is_vehicle_rental boolean NOT NULL DEFAULT false;
