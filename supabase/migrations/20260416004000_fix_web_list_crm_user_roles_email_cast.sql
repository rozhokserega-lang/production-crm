create or replace function public.web_list_crm_user_roles()
returns table (
  user_id uuid,
  email text,
  role text,
  assigned_by uuid,
  note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['admin']);

  return query
  select
    r.user_id,
    coalesce(u.email::text, ''::text) as email,
    r.role,
    r.assigned_by,
    r.note,
    r.updated_at
  from public.crm_user_roles r
  left join auth.users u on u.id = r.user_id
  order by lower(coalesce(u.email::text, ''::text)), r.user_id;
end;
$$;

grant execute on function public.web_list_crm_user_roles() to authenticated, service_role;
