UPDATE public.piggy_banks SET auto_rate = true WHERE auto_rate = false;
ALTER TABLE public.piggy_banks ALTER COLUMN auto_rate SET DEFAULT true;