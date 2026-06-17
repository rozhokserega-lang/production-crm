-- CRM role: planner (Планировщик) — только планировщик трудоёмкости.

alter table public.crm_user_roles
  drop constraint if exists crm_user_roles_role_check;

alter table public.crm_user_roles
  add constraint crm_user_roles_role_check
  check (
    lower(trim(role)) in (
      'admin',
      'manager',
      'operator',
      'operator_pilka',
      'operator_kromka',
      'operator_pras',
      'planner',
      'viewer',
      'warehouse'
    )
  );

create or replace function public.web_is_valid_crm_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(trim(p_role), '')) in (
    'admin',
    'manager',
    'operator',
    'operator_pilka',
    'operator_kromka',
    'operator_pras',
    'planner',
    'viewer',
    'warehouse'
  )
$$;

grant execute on function public.web_is_valid_crm_role(text) to anon, authenticated, service_role;

create or replace function public.web_get_labor_norms()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ln.id,
      'group_name', ln.group_name,
      'groupName', ln.group_name,
      'pilka_min', ln.pilka_min,
      'pilkaMin', ln.pilka_min,
      'kromka_min', ln.kromka_min,
      'kromkaMin', ln.kromka_min,
      'pras_min', ln.pras_min,
      'prasMin', ln.pras_min,
      'assembly_min', ln.assembly_min,
      'assemblyMin', ln.assembly_min,
      'qty_unit', ln.qty_unit,
      'qtyUnit', ln.qty_unit,
      'note', ln.note,
      'created_at', ln.created_at,
      'updated_at', ln.updated_at
    ) order by ln.group_name
  ), '[]'::jsonb)
  into v_result
  from public.labor_norms ln;

  return v_result;
end;
$$;

create or replace function public.web_upsert_labor_kit(
  p_id       bigint default null,
  p_kit_name text default '',
  p_items    jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.labor_kits;
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  if p_id is not null then
    update public.labor_kits
      set kit_name = nullif(trim(coalesce(p_kit_name, '')), ''),
          items    = coalesce(p_items, '[]'::jsonb)
      where id = p_id
      returning * into v_row;

    if not found then
      raise exception 'labor_kit with id % not found', p_id;
    end if;
  else
    insert into public.labor_kits (kit_name, items)
      values (
        nullif(trim(coalesce(p_kit_name, '')), ''),
        coalesce(p_items, '[]'::jsonb)
      )
      returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',         v_row.id,
    'kit_name',   v_row.kit_name,
    'name',       v_row.kit_name,
    'items',      v_row.items,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.web_upsert_labor_kit_plan_qty(
  p_kit_id bigint,
  p_qty numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.labor_kit_plan_qty%rowtype;
  v_qty numeric := greatest(0, coalesce(p_qty, 0));
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  if p_kit_id is null or p_kit_id <= 0 then
    raise exception 'kit_id is required';
  end if;

  if not exists (select 1 from public.labor_kits lk where lk.id = p_kit_id) then
    raise exception 'labor_kit with id % not found', p_kit_id;
  end if;

  insert into public.labor_kit_plan_qty (kit_id, planned_qty)
  values (p_kit_id, v_qty)
  on conflict (kit_id)
  do update set planned_qty = excluded.planned_qty
  returning * into v_row;

  return jsonb_build_object(
    'kit_id', v_row.kit_id,
    'planned_qty', v_row.planned_qty,
    'updated_at', v_row.updated_at
  );
end;
$$;

drop function if exists public.web_delete_labor_kit(int);
drop function if exists public.web_delete_labor_kit(bigint);

create or replace function public.web_delete_labor_kit(
  p_id bigint
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  delete from public.labor_kits where id = p_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.web_get_labor_norms() to anon, authenticated, service_role;
grant execute on function public.web_upsert_labor_kit(bigint, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.web_upsert_labor_kit_plan_qty(bigint, numeric) to anon, authenticated, service_role;
grant execute on function public.web_delete_labor_kit(bigint) to anon, authenticated, service_role;
