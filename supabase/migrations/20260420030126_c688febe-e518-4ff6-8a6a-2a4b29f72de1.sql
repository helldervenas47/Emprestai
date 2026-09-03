CREATE TABLE public.account_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view account settings"
ON public.account_settings FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert account settings"
ON public.account_settings FOR INSERT
TO authenticated
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update account settings"
ON public.account_settings FOR UPDATE
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owner can delete account settings"
ON public.account_settings FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

CREATE TRIGGER update_account_settings_updated_at
BEFORE UPDATE ON public.account_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();