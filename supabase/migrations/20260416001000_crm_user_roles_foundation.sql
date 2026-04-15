-- Stage 3 foundation: user-bound CRM roles for real authenticated access.

create table if not exists public.crm_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  assigned_by uuid null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_user_roles_role_check
    check (lower(trim(role)) in ('admin', 'manager', 'operator', 'viewer'))
);

create or replace function public.crm_user_roles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_crm_user_roles_touch_updated_at on public.crm_user_roles;
create trigger trg_crm_user_roles_touch_updated_at
before update on public.crm_user_roles
for each row
execute function public.crm_user_roles_touch_updated_at();

create or replace function public.web_effective_crm_role()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
  v_claim_role text := lower(trim(coalesce(v_claims -> 'app_metadata' ->> 'crm_role', v_claims ->> 'crm_role', '')));
  v_user_role text := null;
  v_uid uuid := auth.uid();
begin
  if v_db_role = 'service_role' then
    return 'admin';
  end if;

  if v_uid is not null then
    select lower(trim(r.role))
      into v_user_role
    from public.crm_user_roles r
    where r.user_id = v_uid
    limit 1;

    if public.web_is_valid_crm_role(v_user_role) then
      return v_user_role;
    end if;
  end if;

  if public.web_is_valid_crm_role(v_claim_role) then
    return v_claim_role;
  end if;

  if v_uid is null then
    if public.web_is_crm_auth_strict() then
      return 'viewer';
    end if;
    return 'admin';
  end if;

  return 'viewer';
end;
$$;

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
  on conflict (user_id) do update
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

create or replace function public.web_remove_crm_user_role(p_user_id uuid)
returns table (
  removed boolean,
  user_id uuid
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_removed integer := 0;
begin
  perform public.web_require_roles(array['admin']);

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  delete from public.crm_user_roles r
  where r.user_id = p_user_id;
  get diagnostics v_removed = row_count;

  return query
  select (v_removed > 0), p_user_id;
end;
$$;

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
    coalesce(u.email, '') as email,
    r.role,
    r.assigned_by,
    r.note,
    r.updated_at
  from public.crm_user_roles r
  left join auth.users u on u.id = r.user_id
  order by lower(coalesce(u.email, '')), r.user_id;
end;
$$;

grant execute on function public.web_effective_crm_role() to anon, authenticated, service_role;
grant execute on function public.web_set_crm_user_role(uuid, text, text) to authenticated, service_role;
grant execute on function public.web_remove_crm_user_role(uuid) to authenticated, service_role;
grant execute on function public.web_list_crm_user_roles() to authenticated, service_role;
