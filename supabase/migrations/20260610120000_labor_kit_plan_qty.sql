-- Плановое количество комплектов в планировщике трудоёмкости.

create table if not exists public.labor_kit_plan_qty (
  kit_id       bigint primary key references public.labor_kits(id) on delete cascade,
  planned_qty  numeric(12, 2) not null default 0 check (planned_qty >= 0),
  updated_at   timestamptz not null default now()
);

alter table public.labor_kit_plan_qty enable row level security;

drop policy if exists labor_kit_plan_qty_all on public.labor_kit_plan_qty;
create policy labor_kit_plan_qty_all
  on public.labor_kit_plan_qty
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.tg_labor_kit_plan_qty_updated_at()
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

drop trigger if exists trg_labor_kit_plan_qty_updated_at on public.labor_kit_plan_qty;
create trigger trg_labor_kit_plan_qty_updated_at
  before update on public.labor_kit_plan_qty
  for each row
  execute function public.tg_labor_kit_plan_qty_updated_at();

create or replace function public.web_get_labor_kit_plan_qty()
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
      'kit_id', q.kit_id,
      'planned_qty', q.planned_qty,
      'updated_at', q.updated_at
    ) order by q.kit_id
  ), '[]'::jsonb)
  into v_result
  from public.labor_kit_plan_qty q;

  return v_result;
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
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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

grant execute on function public.web_get_labor_kit_plan_qty() to anon, authenticated, service_role;
grant execute on function public.web_upsert_labor_kit_plan_qty(bigint, numeric) to anon, authenticated, service_role;
