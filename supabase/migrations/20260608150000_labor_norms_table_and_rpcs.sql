-- Шаг 2: фиксированные нормативы трудоёмкости по группам изделий.

create table if not exists public.labor_norms (
  id serial primary key,
  group_name text not null,
  pilka_min numeric(12, 2) not null default 0,
  kromka_min numeric(12, 2) not null default 0,
  pras_min numeric(12, 2) not null default 0,
  assembly_min numeric(12, 2) not null default 0,
  qty_unit numeric(12, 2) not null default 1,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_norms_group_name_unique unique (group_name),
  constraint labor_norms_qty_unit_positive check (qty_unit > 0)
);

create index if not exists idx_labor_norms_group_name on public.labor_norms (group_name);

alter table public.labor_norms enable row level security;

drop policy if exists "allow_all_authenticated_labor_norms" on public.labor_norms;
create policy "allow_all_authenticated_labor_norms"
  on public.labor_norms
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.tg_labor_norms_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_labor_norms_updated_at on public.labor_norms;
create trigger trg_labor_norms_updated_at
  before update on public.labor_norms
  for each row
  execute function public.tg_labor_norms_updated_at();

create or replace function public.web_get_labor_norms()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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

create or replace function public.web_upsert_labor_norm(
  p_id int default null,
  p_group_name text default '',
  p_pilka_min numeric default 0,
  p_kromka_min numeric default 0,
  p_pras_min numeric default 0,
  p_assembly_min numeric default 0,
  p_qty_unit numeric default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.labor_norms;
  v_group text := nullif(trim(coalesce(p_group_name, '')), '');
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_group is null then
    raise exception 'group_name is required';
  end if;

  if coalesce(p_qty_unit, 0) <= 0 then
    raise exception 'qty_unit must be > 0';
  end if;

  if p_id is not null then
    update public.labor_norms
    set
      group_name = v_group,
      pilka_min = greatest(0, coalesce(p_pilka_min, 0)),
      kromka_min = greatest(0, coalesce(p_kromka_min, 0)),
      pras_min = greatest(0, coalesce(p_pras_min, 0)),
      assembly_min = greatest(0, coalesce(p_assembly_min, 0)),
      qty_unit = coalesce(p_qty_unit, 1),
      note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_id
    returning * into v_row;

    if not found then
      raise exception 'labor_norm with id % not found', p_id;
    end if;
  else
    insert into public.labor_norms (
      group_name, pilka_min, kromka_min, pras_min, assembly_min, qty_unit, note
    )
    values (
      v_group,
      greatest(0, coalesce(p_pilka_min, 0)),
      greatest(0, coalesce(p_kromka_min, 0)),
      greatest(0, coalesce(p_pras_min, 0)),
      greatest(0, coalesce(p_assembly_min, 0)),
      coalesce(p_qty_unit, 1),
      nullif(trim(coalesce(p_note, '')), '')
    )
    on conflict (group_name)
    do update
      set pilka_min = excluded.pilka_min,
          kromka_min = excluded.kromka_min,
          pras_min = excluded.pras_min,
          assembly_min = excluded.assembly_min,
          qty_unit = excluded.qty_unit,
          note = excluded.note,
          updated_at = now()
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'group_name', v_row.group_name,
    'groupName', v_row.group_name,
    'pilka_min', v_row.pilka_min,
    'pilkaMin', v_row.pilka_min,
    'kromka_min', v_row.kromka_min,
    'kromkaMin', v_row.kromka_min,
    'pras_min', v_row.pras_min,
    'prasMin', v_row.pras_min,
    'assembly_min', v_row.assembly_min,
    'assemblyMin', v_row.assembly_min,
    'qty_unit', v_row.qty_unit,
    'qtyUnit', v_row.qty_unit,
    'note', v_row.note,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.web_delete_labor_norm(p_id int)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  delete from public.labor_norms where id = p_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.web_get_labor_norms() to anon, authenticated, service_role;
grant execute on function public.web_upsert_labor_norm(int, text, numeric, numeric, numeric, numeric, numeric, text) to anon, authenticated, service_role;
grant execute on function public.web_delete_labor_norm(int) to anon, authenticated, service_role;
