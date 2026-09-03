-- =====================================================================
-- RLS Audit & Hardening
-- Corrige vulnerabilidades apontadas pelo scanner de segurança:
--   1) Escalada de privilégio em public.user_roles (auto-promoção a admin)
--   2) Coluna `token` exposta em public.system_telegram_bots
--   3) account_ledger sem policies visíveis (fail-closed quebra leitura)
--   4) Functions SECURITY DEFINER sem search_path travado e/ou com
--      EXECUTE concedido a anon/authenticated
--
-- Aplicar via Painel Migração ou psql como service_role.
-- Não altera estrutura de tabelas nem regras de negócio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) user_roles: bloquear self-promotion e gestão por não-admin
-- ---------------------------------------------------------------------
-- Função has_role (segura, search_path travado) já deve existir; se não,
-- recriamos para garantir.
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

revoke execute on function public.has_role(uuid, app_role) from public, anon;
grant  execute on function public.has_role(uuid, app_role) to authenticated, service_role;

-- Limpa policies amplas anteriores
drop policy if exists "Admins can manage roles"        on public.user_roles;
drop policy if exists "Users can view their own roles" on public.user_roles;
drop policy if exists "Users view own role"            on public.user_roles;
drop policy if exists "user_roles_select_own"          on public.user_roles;
drop policy if exists "user_roles_admin_select"        on public.user_roles;
drop policy if exists "user_roles_admin_write"         on public.user_roles;

-- SELECT: usuário vê apenas o próprio papel; admin vê todos
create policy "user_roles_select_own"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

create policy "user_roles_admin_select"
  on public.user_roles for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- INSERT/UPDATE/DELETE: somente admins, e nunca permite que o próprio
-- usuário se conceda admin (corrige a janela de bootstrap).
create policy "user_roles_admin_insert"
  on public.user_roles for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    and user_id <> auth.uid()
  );

create policy "user_roles_admin_update"
  on public.user_roles for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (
    public.has_role(auth.uid(), 'admin')
    and user_id <> auth.uid()
  );

create policy "user_roles_admin_delete"
  on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and user_id <> auth.uid());

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------
-- 2) system_telegram_bots: ocultar coluna `token`
-- ---------------------------------------------------------------------
revoke select (token) on public.system_telegram_bots from authenticated;
revoke select (token) on public.system_telegram_bots from anon;
grant  select (id, name, purpose, active, bot_id, bot_username, description,
               validation_status, last_validated_at, created_at, created_by)
  on public.system_telegram_bots to authenticated;
grant  all on public.system_telegram_bots to service_role;

-- ---------------------------------------------------------------------
-- 3) account_ledger: dar leitura/escrita ao próprio dono
-- ---------------------------------------------------------------------
alter table public.account_ledger enable row level security;
grant select, insert, update, delete on public.account_ledger to authenticated;
grant all on public.account_ledger to service_role;

drop policy if exists "account_ledger_select_own" on public.account_ledger;
drop policy if exists "account_ledger_insert_own" on public.account_ledger;
drop policy if exists "account_ledger_update_own" on public.account_ledger;
drop policy if exists "account_ledger_delete_own" on public.account_ledger;

create policy "account_ledger_select_own"
  on public.account_ledger for select to authenticated
  using (user_id = auth.uid() or user_id = public.get_data_owner_id(auth.uid()));

create policy "account_ledger_insert_own"
  on public.account_ledger for insert to authenticated
  with check (user_id = auth.uid() or user_id = public.get_data_owner_id(auth.uid()));

create policy "account_ledger_update_own"
  on public.account_ledger for update to authenticated
  using  (user_id = auth.uid() or user_id = public.get_data_owner_id(auth.uid()))
  with check (user_id = auth.uid() or user_id = public.get_data_owner_id(auth.uid()));

create policy "account_ledger_delete_own"
  on public.account_ledger for delete to authenticated
  using (user_id = auth.uid() or user_id = public.get_data_owner_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 4) Funções SECURITY DEFINER: travar search_path e restringir EXECUTE
-- ---------------------------------------------------------------------
alter function public.get_data_owner_id(uuid)  set search_path = public;
alter function public.handle_new_user()         set search_path = public;
alter function public.update_updated_at_column() set search_path = public;

-- list_my_sessions é um shim — não precisa ser SECURITY DEFINER nem público
revoke execute on function public.list_my_sessions() from public, anon;
grant  execute on function public.list_my_sessions() to authenticated;

revoke execute on function public.get_data_owner_id(uuid) from public, anon;
grant  execute on function public.get_data_owner_id(uuid) to authenticated, service_role;

-- handle_new_user é trigger de auth — não deve ser chamável diretamente
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Garantia: GRANTs do Data API em toda tabela pública multi-tenant
--     (idempotente — só insere onde está faltando)
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname='public'
      and c.relname <> 'system_telegram_bots'   -- evita regredir o REVOKE de `token`
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
    execute format('grant all on public.%I to service_role', t.relname);
  end loop;
end$$;

-- Reafirma proteção da coluna `token` (idempotente, fica por último)
revoke select (token), insert (token), update (token)
  on public.system_telegram_bots from authenticated, anon;
