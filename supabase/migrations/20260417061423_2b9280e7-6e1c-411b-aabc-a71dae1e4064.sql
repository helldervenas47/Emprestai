ALTER TABLE public.manager_commissions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manager_commissions;