-- ============================================================================
-- Rodar UMA vez no Supabase EXTERNO (projeto principal do app).
-- Idempotente: pode reexecutar sem quebrar.
--
-- Objetivos:
--  1. Garantir a coluna `username` em profiles (unique, case-insensitive).
--  2. Adicionar a coluna `subscription_bump_at` (usada para sinalizar via
--     Realtime que a assinatura do usuário mudou — o cliente escuta a
--     PRÓPRIA linha em profiles e refetcha).
--  3. Criar RPC `is_username_available` consultável antes do signup.
-- ============================================================================

create extension if not exists citext;

alter table public.profiles
  add column if not exists username citext,
  add column if not exists subscription_bump_at timestamptz;

-- Unicidade (ignora NULLs — usuários legados sem username continuam válidos).
create unique index if not exists profiles_username_uidx
  on public.profiles (username)
  where username is not null;

-- RPC pública: retorna true se o username está disponível.
create or replace function public.is_username_available(_u text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _u is null or length(trim(_u)) = 0 then false
    else not exists (
      select 1 from public.profiles where username = _u::citext
    )
  end;
$$;

grant execute on function public.is_username_available(text) to anon, authenticated, service_role;
