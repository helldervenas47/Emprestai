CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));