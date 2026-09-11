-- Separa a antiga aba Relatório sem retirar acessos já concedidos.
insert into public.role_tab_permissions (role, tab_id)
select role, new_tab
from public.role_tab_permissions
cross join (values ('telegram_reports'), ('billing_center')) as tabs(new_tab)
where tab_id = 'overdue'
on conflict (role, tab_id) do nothing;

-- Replica as permissões granulares de Relatórios para os dois novos módulos.
insert into public.role_permissions (
  role,
  module,
  can_view,
  can_create,
  can_edit,
  can_delete,
  updated_by
)
select
  role,
  new_module,
  can_view,
  can_create,
  can_edit,
  can_delete,
  updated_by
from public.role_permissions
cross join (values ('telegram_reports'), ('billing_center')) as modules(new_module)
where module = 'reports'
on conflict (role, module) do nothing;
