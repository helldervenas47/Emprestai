-- Remove billing_center dos papéis não-admin para que apenas administradores tenham acesso à Central de Cobranças por padrão.
DELETE FROM public.role_tab_permissions
WHERE tab_id = 'billing_center'
  AND role IN ('cliente', 'gerente', 'visualizador');
