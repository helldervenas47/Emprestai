-- =====================================================================
-- user_api_keys — armazenamento seguro de API Keys do usuário
-- A chave em texto puro fica no banco (apenas service_role lê), o cliente
-- nunca recebe o valor completo — somente os 4 últimos caracteres.
-- =====================================================================

create table if not exists public.user_api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  key         text not null,            -- valor completo (server-only)
  key_last4   text not null,            -- exposto ao cliente (mask)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, name)
);

-- Cliente NÃO recebe nenhuma coluna — toda leitura é via edge function
-- usando service_role. Mantemos RLS habilitada (defense-in-depth) e
-- garantimos que mesmo authenticated não consiga selecionar `key`.
revoke all on public.user_api_keys from anon, authenticated;
grant  all on public.user_api_keys to service_role;

alter table public.user_api_keys enable row level security;

drop policy if exists "user_api_keys_owner_all" on public.user_api_keys;
-- Policy de owner (não é usada hoje pelo cliente, mas é correta caso um
-- dia o app precise listar apenas metadados via PostgREST com grants de
-- coluna). Permanece restritiva por padrão.
create policy "user_api_keys_owner_all"
  on public.user_api_keys for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists user_api_keys_user_idx
  on public.user_api_keys(user_id, created_at desc);

create or replace function public.user_api_keys_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists user_api_keys_updated on public.user_api_keys;
create trigger user_api_keys_updated
  before update on public.user_api_keys
  for each row execute function public.user_api_keys_set_updated_at();
