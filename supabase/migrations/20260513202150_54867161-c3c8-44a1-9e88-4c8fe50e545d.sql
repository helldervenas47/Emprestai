ALTER TABLE public.user_tab_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.user_client_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tab_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_client_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;