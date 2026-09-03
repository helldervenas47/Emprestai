-- 1) Add require_approval to account_settings
ALTER TABLE public.account_settings 
  ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false;

-- 2) invite_codes table (admin-generated signup invite links)
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  uses_count integer NOT NULL DEFAULT 0,
  max_uses integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own invite codes"
  ON public.invite_codes FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners insert own invite codes"
  ON public.invite_codes FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners update own invite codes"
  ON public.invite_codes FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners delete own invite codes"
  ON public.invite_codes FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Public (anon) can read active invite codes to validate during signup
CREATE POLICY "Anyone can validate active invite codes"
  ON public.invite_codes FOR SELECT TO anon, authenticated
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE TRIGGER trg_invite_codes_updated_at
  BEFORE UPDATE ON public.invite_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) user_approvals table
CREATE TABLE IF NOT EXISTS public.user_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  email text,
  display_name text,
  invite_code text,
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_approvals_owner_status
  ON public.user_approvals(owner_id, status);

ALTER TABLE public.user_approvals ENABLE ROW LEVEL SECURITY;

-- Owner (admin) sees all their approval requests
CREATE POLICY "Owner views own approvals"
  ON public.user_approvals FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- User sees their own approval status
CREATE POLICY "User views own approval status"
  ON public.user_approvals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Anyone authenticated can insert their own pending request (signup flow)
CREATE POLICY "User creates own approval request"
  ON public.user_approvals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner updates (approve/reject)
CREATE POLICY "Owner updates approvals"
  ON public.user_approvals FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes approvals"
  ON public.user_approvals FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER trg_user_approvals_updated_at
  BEFORE UPDATE ON public.user_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Helper function: is user pending approval?
CREATE OR REPLACE FUNCTION public.is_user_pending(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_approvals
    WHERE user_id = _user_id AND status = 'pending'
  )
$$;

-- 5) Enable realtime for user_approvals
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_approvals;