-- Add dedicated warehouse-only CRM role.

alter table public.crm_user_roles
  drop constraint if exists crm_user_roles_role_check;

alter table public.crm_user_roles
  add constraint crm_user_roles_role_check
  check (lower(trim(role)) in ('admin', 'manager', 'operator', 'viewer', 'warehouse'));

create or replace function public.web_is_valid_crm_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(trim(p_role), '')) in ('admin', 'manager', 'operator', 'viewer', 'warehouse')
$$;

grant execute on function public.web_is_valid_crm_role(text) to anon, authenticated, service_role;
