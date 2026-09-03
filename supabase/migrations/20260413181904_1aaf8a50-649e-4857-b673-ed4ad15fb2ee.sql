
-- 1. Create user_owner table to link sub-users to admin
CREATE TABLE public.user_owner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_owner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view user_owner" ON public.user_owner
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert user_owner" ON public.user_owner
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete user_owner" ON public.user_owner
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- 2. Security definer function: get the data owner for a user
CREATE OR REPLACE FUNCTION public.get_data_owner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT owner_id FROM public.user_owner WHERE user_id = _user_id),
    _user_id
  )
$$;

-- 3. Security definer function: can this user write (create/edit/delete) data?
CREATE OR REPLACE FUNCTION public.can_write_data(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- User is the data owner (no entry in user_owner)
    NOT EXISTS (SELECT 1 FROM public.user_owner WHERE user_id = _user_id)
    OR
    -- User has admin or operador role
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'operador')
    )
$$;

-- 4. Update RLS policies on all data tables
-- Pattern: SELECT allows owner + all sub-users; INSERT/UPDATE/DELETE allows owner + operador/admin

-- === LOANS ===
DROP POLICY IF EXISTS "Users can view own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can insert own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can update own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can delete own loans" ON public.loans;

CREATE POLICY "Users can view loans" ON public.loans FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert loans" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update loans" ON public.loans FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete loans" ON public.loans FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === CLIENTS ===
DROP POLICY IF EXISTS "Users can view own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can insert own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete own clients" ON public.clients;

CREATE POLICY "Users can view clients" ON public.clients FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update clients" ON public.clients FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete clients" ON public.clients FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === EXPENSES ===
DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON public.expenses;

CREATE POLICY "Users can view expenses" ON public.expenses FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete expenses" ON public.expenses FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === LOAN_INSTALLMENTS ===
DROP POLICY IF EXISTS "Users can view own installments" ON public.loan_installments;
DROP POLICY IF EXISTS "Users can insert own installments" ON public.loan_installments;
DROP POLICY IF EXISTS "Users can update own installments" ON public.loan_installments;
DROP POLICY IF EXISTS "Users can delete own installments" ON public.loan_installments;

CREATE POLICY "Users can view installments" ON public.loan_installments FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert installments" ON public.loan_installments FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update installments" ON public.loan_installments FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete installments" ON public.loan_installments FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === PAYMENTS ===
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can delete own payments" ON public.payments;

CREATE POLICY "Users can view payments" ON public.payments FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete payments" ON public.payments FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === PRODUCTS ===
DROP POLICY IF EXISTS "Users can view own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own products" ON public.products;

CREATE POLICY "Users can view products" ON public.products FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update products" ON public.products FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete products" ON public.products FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === SALES ===
DROP POLICY IF EXISTS "Users can view own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can update own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can delete own sales" ON public.sales;

CREATE POLICY "Users can view sales" ON public.sales FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update sales" ON public.sales FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete sales" ON public.sales FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === BALANCE ===
DROP POLICY IF EXISTS "Users can view own balance" ON public.balance;
DROP POLICY IF EXISTS "Users can insert own balance" ON public.balance;
DROP POLICY IF EXISTS "Users can update own balance" ON public.balance;
DROP POLICY IF EXISTS "Users can delete own balance" ON public.balance;

CREATE POLICY "Users can view balance" ON public.balance FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert balance" ON public.balance FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update balance" ON public.balance FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete balance" ON public.balance FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

-- === VEHICLE_BALANCE ===
DROP POLICY IF EXISTS "Users can view own vehicle balance" ON public.vehicle_balance;
DROP POLICY IF EXISTS "Users can insert own vehicle balance" ON public.vehicle_balance;
DROP POLICY IF EXISTS "Users can update own vehicle balance" ON public.vehicle_balance;
DROP POLICY IF EXISTS "Users can delete own vehicle balance" ON public.vehicle_balance;

CREATE POLICY "Users can view vehicle_balance" ON public.vehicle_balance FOR SELECT TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()));
CREATE POLICY "Users can insert vehicle_balance" ON public.vehicle_balance FOR INSERT TO authenticated
  WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can update vehicle_balance" ON public.vehicle_balance FOR UPDATE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
CREATE POLICY "Users can delete vehicle_balance" ON public.vehicle_balance FOR DELETE TO authenticated
  USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));
