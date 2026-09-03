-- 1. admin_viewing_sessions: require admin role on DELETE
DROP POLICY IF EXISTS "Admins manage own viewing sessions delete" ON public.admin_viewing_sessions;
CREATE POLICY "Admins manage own viewing sessions delete"
ON public.admin_viewing_sessions
FOR DELETE
TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

-- 2. user_approvals: tighten INSERT to require a real, active invite_code linked to that owner
DROP POLICY IF EXISTS "User creates own approval request" ON public.user_approvals;
CREATE POLICY "User creates own approval request"
ON public.user_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND invite_code IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.invite_codes ic
    WHERE ic.code = user_approvals.invite_code
      AND ic.owner_id = user_approvals.owner_id
      AND ic.active = true
      AND (ic.expires_at IS NULL OR ic.expires_at > now())
      AND (ic.max_uses IS NULL OR ic.uses_count < ic.max_uses)
  )
);

-- 3. Explicit service-role-only write policies on tracking_positions
CREATE POLICY "service_role manages tracking positions"
ON public.tracking_positions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Explicit service-role-only write policies on backup_history
CREATE POLICY "service_role manages backup history"
ON public.backup_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. app_internal_config: explicit service-role policy (deny everyone else)
CREATE POLICY "service_role manages app internal config"
ON public.app_internal_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Seed a shared cron secret in app_internal_config if missing (used by edge functions)
INSERT INTO public.app_internal_config (key, value)
SELECT 'cron_secret', encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.app_internal_config WHERE key = 'cron_secret');