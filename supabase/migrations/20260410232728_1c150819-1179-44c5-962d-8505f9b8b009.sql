
-- Fix products UPDATE policy
DROP POLICY "Users can update own products" ON public.products;
CREATE POLICY "Users can update own products" ON public.products
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix balance: add missing DELETE policy
CREATE POLICY "Users can delete own balance" ON public.balance
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Fix balance UPDATE policy
DROP POLICY "Users can update own balance" ON public.balance;
CREATE POLICY "Users can update own balance" ON public.balance
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix clients UPDATE policy
DROP POLICY "Users can update own clients" ON public.clients;
CREATE POLICY "Users can update own clients" ON public.clients
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix loans UPDATE policy
DROP POLICY "Users can update own loans" ON public.loans;
CREATE POLICY "Users can update own loans" ON public.loans
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix expenses UPDATE policy
DROP POLICY "Users can update own expenses" ON public.expenses;
CREATE POLICY "Users can update own expenses" ON public.expenses
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix profiles UPDATE policy
DROP POLICY "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
