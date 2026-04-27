-- Labor kits table for storing kit definitions used in LaborView planner.
-- Each kit has a name and a set of items (group + qty).

create table if not exists public.labor_kits (
  id        serial primary key,
  kit_name  text not null,
  items     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.labor_kits enable row level security;

create policy "allow_all_authenticated"
  on public.labor_kits
  for all
  to authenticated
  using (true)
  with check (true);

-- Trigger to auto-update updated_at
create or replace function public.tg_labor_kits_updated_at()
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

drop trigger if exists trg_labor_kits_updated_at on public.labor_kits;
create trigger trg_labor_kits_updated_at
  before update on public.labor_kits
  for each row
  execute function public.tg_labor_kits_updated_at();

-- ── RPC: web_get_labor_kits ──────────────────────────────────────────
drop function if exists public.web_get_labor_kits();

create or replace function public.web_get_labor_kits()
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
      'id',        lk.id,
      'kit_name',  lk.kit_name,
      'name',      lk.kit_name,
      'items',     lk.items,
      'created_at', lk.created_at,
      'updated_at', lk.updated_at
    ) order by lk.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.labor_kits lk;

  return v_result;
end;
$$;

alter function public.web_get_labor_kits()
  set search_path = public, pg_temp;

grant execute on function public.web_get_labor_kits() to anon, authenticated;

-- ── RPC: web_upsert_labor_kit ────────────────────────────────────────
drop function if exists public.web_upsert_labor_kit(p_id int, p_kit_name text, p_items jsonb);

create or replace function public.web_upsert_labor_kit(
  p_id       int default null,
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
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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
    'id',        v_row.id,
    'kit_name',  v_row.kit_name,
    'name',      v_row.kit_name,
    'items',     v_row.items,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

alter function public.web_upsert_labor_kit(int, text, jsonb)
  set search_path = public, pg_temp;

grant execute on function public.web_upsert_labor_kit(int, text, jsonb) to anon, authenticated;

-- ── RPC: web_delete_labor_kit ────────────────────────────────────────
drop function if exists public.web_delete_labor_kit(p_id int);

create or replace function public.web_delete_labor_kit(
  p_id int
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  delete from public.labor_kits where id = p_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

alter function public.web_delete_labor_kit(int)
  set search_path = public, pg_temp;

grant execute on function public.web_delete_labor_kit(int) to anon, authenticated;
