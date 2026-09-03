-- Allow admins to update subscriptions
CREATE POLICY "Admins can update subscriptions"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete subscriptions
CREATE POLICY "Admins can delete subscriptions"
  ON public.subscriptions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert subscriptions
CREATE POLICY "Admins can insert subscriptions"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));