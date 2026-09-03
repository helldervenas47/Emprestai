-- Restrict user_telegram_bots SELECT to actual owner (not sub-users)
DROP POLICY IF EXISTS "user_telegram_bots_select_own" ON public.user_telegram_bots;
CREATE POLICY "user_telegram_bots_select_own"
ON public.user_telegram_bots
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- Also tighten write policies so only true owner manages bot credentials
DROP POLICY IF EXISTS "user_telegram_bots_update_own" ON public.user_telegram_bots;
CREATE POLICY "user_telegram_bots_update_own"
ON public.user_telegram_bots
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "user_telegram_bots_delete_own" ON public.user_telegram_bots;
CREATE POLICY "user_telegram_bots_delete_own"
ON public.user_telegram_bots
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Restrict tracking_providers SELECT to actual owner only (credential secret names)
DROP POLICY IF EXISTS "owner can view tracking provider" ON public.tracking_providers;
CREATE POLICY "owner can view tracking provider"
ON public.tracking_providers
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- Allow users to read their own role assignments
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());