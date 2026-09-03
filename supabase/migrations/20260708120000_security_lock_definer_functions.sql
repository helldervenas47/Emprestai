alter function public.list_my_sessions() set search_path = public;
revoke execute on function public.list_my_sessions() from public, anon;
grant  execute on function public.list_my_sessions() to authenticated;

revoke execute on function public.get_data_owner_id(uuid) from public, anon;
grant  execute on function public.get_data_owner_id(uuid) to authenticated, service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
