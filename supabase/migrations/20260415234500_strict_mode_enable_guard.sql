-- Safety guard: do not allow enabling strict mode from anonymous context,
-- otherwise current anon-based access can lock itself out immediately.

create or replace function public.web_set_crm_auth_strict(p_enabled boolean)
returns table(enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
begin
  perform public.web_require_roles(array['admin']);

  if coalesce(p_enabled, false) = true
     and auth.uid() is null
     and v_db_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Нельзя включить strict mode без авторизованного admin-пользователя';
  end if;

  insert into public.crm_runtime_settings(key, value_text, updated_at)
  values ('crm_auth_strict', case when coalesce(p_enabled, false) then 'true' else 'false' end, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select public.web_is_crm_auth_strict(), s.updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_auth_strict'
  limit 1;
end;
$$;

grant execute on function public.web_set_crm_auth_strict(boolean) to anon, authenticated, service_role;
