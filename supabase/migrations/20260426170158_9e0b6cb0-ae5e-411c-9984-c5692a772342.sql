CREATE POLICY "Users can update loan_renegotiations"
ON public.loan_renegotiations
FOR UPDATE
TO authenticated
USING ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()))
WITH CHECK ((user_id = get_data_owner_id(auth.uid())) AND can_write_data(auth.uid()));