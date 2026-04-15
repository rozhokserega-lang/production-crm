create or replace function public.web_set_crm_user_role(
  p_user_id uuid,
  p_role text,
  p_note text default null
)
returns table (
  user_id uuid,
  role text,
  assigned_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_assigner uuid := auth.uid();
begin
  perform public.web_require_roles(array['admin']);

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if not public.web_is_valid_crm_role(v_role) then
    raise exception 'Invalid CRM role: %', p_role;
  end if;

  insert into public.crm_user_roles(user_id, role, assigned_by, note)
  values (p_user_id, v_role, v_assigner, nullif(trim(coalesce(p_note, '')), ''))
  on conflict on constraint crm_user_roles_pkey do update
  set
    role = excluded.role,
    assigned_by = excluded.assigned_by,
    note = excluded.note,
    updated_at = now();

  return query
  select r.user_id, r.role, r.assigned_by, r.updated_at
  from public.crm_user_roles r
  where r.user_id = p_user_id
  limit 1;
end;
$$;

grant execute on function public.web_set_crm_user_role(uuid, text, text) to authenticated, service_role;
