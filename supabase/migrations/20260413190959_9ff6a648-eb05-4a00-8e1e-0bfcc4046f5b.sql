
CREATE TABLE public.user_client_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

ALTER TABLE public.user_client_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all" ON public.user_client_permissions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own" ON public.user_client_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can insert" ON public.user_client_permissions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete" ON public.user_client_permissions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
