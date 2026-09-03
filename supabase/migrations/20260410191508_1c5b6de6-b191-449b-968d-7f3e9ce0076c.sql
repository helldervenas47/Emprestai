
DROP POLICY "Users can view own products" ON public.products;
DROP POLICY "Users can insert own products" ON public.products;
DROP POLICY "Users can update own products" ON public.products;
DROP POLICY "Users can delete own products" ON public.products;

CREATE POLICY "Users can view own products" ON public.products FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY "Users can view own sales" ON public.sales;
DROP POLICY "Users can insert own sales" ON public.sales;
DROP POLICY "Users can delete own sales" ON public.sales;

CREATE POLICY "Users can view own sales" ON public.sales FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sales" ON public.sales FOR DELETE TO authenticated USING (auth.uid() = user_id);
