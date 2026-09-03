
-- Add notes column to sales
ALTER TABLE public.sales ADD COLUMN notes text DEFAULT '';

-- Allow users to update their own sales
CREATE POLICY "Users can update own sales"
ON public.sales
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
