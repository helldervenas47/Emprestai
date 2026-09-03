-- 1) Restrict user_roles INSERT/UPDATE so admins cannot grant 'admin' via API.
--    Admin role assignment must go through service_role (edge functions / DB).
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert non-admin roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'admin'::app_role
);

CREATE POLICY "Admins can update non-admin roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'admin'::app_role
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'admin'::app_role
);

CREATE POLICY "Admins can delete non-admin roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'admin'::app_role
);

-- Service role retains full access (no RLS check) so backend / edge functions
-- can still bootstrap or manage admins safely.

-- 2) Scope realtime.messages so authenticated users may only subscribe to
--    channel topics that include their own auth.uid() as a prefix.
--    Topic naming convention: 'user:<uid>' or 'user:<uid>:<anything>'.
DROP POLICY IF EXISTS "Authenticated users can read all messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can read messages" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can write messages" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated to read messages" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated to insert messages" ON realtime.messages;

CREATE POLICY "Users read own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
);

CREATE POLICY "Users write own realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
);