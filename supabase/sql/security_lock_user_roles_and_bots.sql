-- Restrict user_roles SELECT to the user's own row.
drop policy if exists "Users can view their own roles" on public.user_roles;
drop policy if exists "Users view own role" on public.user_roles;
create policy "Users view own role"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- Keep system_telegram_bots SELECT visible (the app embeds it via FK joins),
-- but block the sensitive `token` column from `authenticated` and `anon`.
-- The service role (used by edge functions) keeps full access.
revoke select (token) on public.system_telegram_bots from authenticated;
revoke select (token) on public.system_telegram_bots from anon;
grant select (id, name, purpose, active, bot_id, bot_username, description,
             validation_status, last_validated_at, created_at, created_by)
  on public.system_telegram_bots to authenticated;

-- Drop the earlier helper view if it was created — no longer needed.
drop view if exists public.system_telegram_bots_public;
