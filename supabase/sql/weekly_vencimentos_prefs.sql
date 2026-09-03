-- Rode este SQL no Supabase externo (syyxnqzxqabeuqbuptkh)
-- Cria tabela de preferência por usuário para o relatório semanal
-- /vencimentos_semana enviado automaticamente às segundas-feiras.

create table if not exists public.telegram_weekly_vencimentos_prefs (
  user_id uuid primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.telegram_weekly_vencimentos_prefs to authenticated;
grant all on public.telegram_weekly_vencimentos_prefs to service_role;

alter table public.telegram_weekly_vencimentos_prefs enable row level security;

drop policy if exists "users manage own weekly prefs" on public.telegram_weekly_vencimentos_prefs;
create policy "users manage own weekly prefs"
on public.telegram_weekly_vencimentos_prefs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
