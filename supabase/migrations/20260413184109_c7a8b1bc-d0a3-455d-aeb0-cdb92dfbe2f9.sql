
CREATE TABLE public.user_tab_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  allowed_tabs TEXT[] NOT NULL DEFAULT ARRAY['overview','dashboard','calendar','clients','products','vehicles','expenses','overdue']::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tab permissions" ON public.user_tab_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can view all tab permissions" ON public.user_tab_permissions
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert tab permissions" ON public.user_tab_permissions
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update tab permissions" ON public.user_tab_permissions
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tab permissions" ON public.user_tab_permissions
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_user_tab_permissions_updated_at
  BEFORE UPDATE ON public.user_tab_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
