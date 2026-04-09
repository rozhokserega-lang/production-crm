-- Stage 1 schema and RPCs for shipment table + labor tab.
-- Safe to run multiple times.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  item text not null,
  material text,
  week text,
  qty numeric(12,2) not null default 0,
  pilka_status text default '',
  kromka_status text default '',
  pras_status text default '',
  assembly_status text default '',
  overall_status text default '',
  pilka_started_at timestamptz,
  pilka_done_at timestamptz,
  kromka_started_at timestamptz,
  kromka_done_at timestamptz,
  pras_started_at timestamptz,
  pras_done_at timestamptz,
  pilka_pause_min integer not null default 0,
  kromka_pause_min integer not null default 0,
  pras_pause_min integer not null default 0,
  pilka_worker text,
  kromka_worker text,
  pras_worker text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipment_plan_cells (
  id bigserial primary key,
  section_name text not null default 'Прочее',
  item text not null,
  material text,
  week text not null,
  qty numeric(12,2) not null default 0,
  row_ref text,
  col_ref text,
  source_row_id text,
  source_col_id text,
  bg text default '#ffffff',
  can_send_to_work boolean not null default true,
  in_work boolean not null default false,
  sheets_needed numeric(12,2) not null default 0,
  available_sheets numeric(12,2) not null default 0,
  material_enough_for_order boolean,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_facts (
  id bigserial primary key,
  order_id text not null,
  item text,
  week text,
  qty numeric(12,2) not null default 0,
  pilka_min numeric(12,2) not null default 0,
  kromka_min numeric(12,2) not null default 0,
  pras_min numeric(12,2) not null default 0,
  assembly_min numeric(12,2) not null default 0,
  total_min numeric(12,2) generated always as (pilka_min + kromka_min + pras_min + assembly_min) stored,
  date_finished date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_week on public.orders(week);
create index if not exists idx_orders_item on public.orders(item);
create index if not exists idx_orders_updated_at on public.orders(updated_at desc);
create index if not exists idx_shipment_plan_cells_week on public.shipment_plan_cells(week);
create index if not exists idx_shipment_plan_cells_item on public.shipment_plan_cells(item);
create index if not exists idx_labor_facts_week on public.labor_facts(week);
create index if not exists idx_labor_facts_order_id on public.labor_facts(order_id);

create or replace function public.web_get_shipment_table()
returns table (
  section_name text,
  row_ref text,
  item text,
  material text,
  week text,
  qty numeric,
  bg text,
  can_send_to_work boolean,
  in_work boolean,
  sheets_needed numeric,
  available_sheets numeric,
  material_enough_for_order boolean,
  source_row_id text,
  source_col_id text,
  note text
)
language sql
stable
as $$
  select
    coalesce(section_name, 'Прочее') as section_name,
    coalesce(row_ref, id::text) as row_ref,
    item,
    material,
    week,
    qty,
    coalesce(bg, '#ffffff') as bg,
    can_send_to_work,
    in_work,
    coalesce(sheets_needed, 0) as sheets_needed,
    coalesce(available_sheets, 0) as available_sheets,
    material_enough_for_order,
    source_row_id,
    source_col_id,
    note
  from public.shipment_plan_cells
  where coalesce(qty, 0) > 0
  order by section_name, item, week;
$$;

create or replace function public.web_get_labor_table()
returns table (
  order_id text,
  item text,
  week text,
  qty numeric,
  pilka_min numeric,
  kromka_min numeric,
  pras_min numeric,
  assembly_min numeric,
  total_min numeric,
  date_finished date
)
language sql
stable
as $$
  select
    lf.order_id,
    lf.item,
    lf.week,
    lf.qty,
    lf.pilka_min,
    lf.kromka_min,
    lf.pras_min,
    lf.assembly_min,
    lf.total_min,
    lf.date_finished
  from public.labor_facts lf
  order by lf.date_finished desc nulls last, lf.order_id;
$$;

create or replace function public.web_get_order_stats()
returns table (
  order_id text,
  item text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  color_name text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    o.item,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    public.resolve_color_name(o.item) as color_name,
    o.updated_at
  from public.orders o
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_upsert_item_color_map(p_item_name text, p_color_name text)
returns table (
  item_name text,
  color_name text,
  source text,
  updated_at timestamptz
)
language plpgsql
as $$
begin
  insert into public.item_color_map(item_name, color_name, source)
  values (trim(p_item_name), trim(p_color_name), 'manual')
  on conflict (item_name)
  do update set
    color_name = excluded.color_name,
    source = 'manual',
    updated_at = now();

  return query
  select m.item_name, m.color_name, m.source, m.updated_at
  from public.item_color_map m
  where m.item_name = trim(p_item_name);
end;
$$;

create or replace function public.web_get_order_stats()
returns table (
  order_id text,
  item text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    o.item,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.updated_at
  from public.orders o
  order by o.updated_at desc nulls last, o.order_id;
$$;

-- Stage 2: full labor timing in Supabase (no Google dependency).
alter table public.orders add column if not exists pilka_started_at timestamptz;
alter table public.orders add column if not exists pilka_done_at timestamptz;
alter table public.orders add column if not exists pilka_pause_started_at timestamptz;
alter table public.orders add column if not exists pilka_pause_acc_min integer not null default 0;
alter table public.orders add column if not exists kromka_started_at timestamptz;
alter table public.orders add column if not exists kromka_done_at timestamptz;
alter table public.orders add column if not exists kromka_pause_started_at timestamptz;
alter table public.orders add column if not exists kromka_pause_acc_min integer not null default 0;
alter table public.orders add column if not exists pras_started_at timestamptz;
alter table public.orders add column if not exists pras_done_at timestamptz;
alter table public.orders add column if not exists pras_pause_started_at timestamptz;
alter table public.orders add column if not exists pras_pause_acc_min integer not null default 0;

create or replace function public.business_minutes(p_start timestamptz, p_end timestamptz)
returns integer
language plpgsql
stable
as $$
declare
  cur_ts timestamptz;
  next_day timestamptz;
  ws timestamptz;
  we timestamptz;
  ls timestamptz;
  le timestamptz;
  ds timestamptz;
  de timestamptz;
  total_minutes numeric := 0;
begin
  if p_start is null or p_end is null or p_start >= p_end then
    return 0;
  end if;
  cur_ts := p_start;
  while cur_ts < p_end loop
    next_day := date_trunc('day', cur_ts) + interval '1 day';
    if extract(dow from cur_ts) <> 0 then
      ws := date_trunc('day', cur_ts) + interval '8 hour';
      we := date_trunc('day', cur_ts) + interval '18 hour';
      ls := date_trunc('day', cur_ts) + interval '12 hour';
      le := date_trunc('day', cur_ts) + interval '13 hour';
      ds := greatest(cur_ts, ws);
      de := least(p_end, we);
      if ds < de then
        total_minutes := total_minutes + extract(epoch from (de - ds)) / 60.0;
        if greatest(ds, ls) < least(de, le) then
          total_minutes := total_minutes - extract(epoch from (least(de, le) - greatest(ds, ls))) / 60.0;
        end if;
      end if;
    end if;
    cur_ts := next_day;
  end loop;
  if total_minutes < 0 then total_minutes := 0; end if;
  if round(total_minutes) = 0 and p_end > p_start then
    return 1;
  end if;
  return round(total_minutes)::integer;
end;
$$;

create or replace function public.web_set_stage_in_work(p_order_id text, p_stage text)
returns public.orders
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
begin
  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='🔨 В работе',
      pilka_started_at=coalesce(pilka_started_at, v_now),
      pilka_pause_started_at=null,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='🔨 В работе',
      kromka_started_at=coalesce(kromka_started_at, v_now),
      kromka_pause_started_at=null,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='🔨 В работе',
      pras_started_at=coalesce(pras_started_at, v_now),
      pras_pause_started_at=null,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;
  return v_row;
end;
$$;

create or replace function public.web_set_stage_pause(p_order_id text, p_stage text)
returns public.orders
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
begin
  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='⏸ Пауза',
      pilka_pause_started_at=coalesce(pilka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='⏸ Пауза',
      kromka_pause_started_at=coalesce(kromka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='⏸ Пауза',
      pras_pause_started_at=coalesce(pras_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;
  return v_row;
end;
$$;

create or replace function public.web_set_stage_done(p_order_id text, p_stage text)
returns public.orders
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
begin
  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='✅ Готово',
      pilka_done_at=coalesce(pilka_done_at, v_now),
      pilka_pause_acc_min=pilka_pause_acc_min + case when pilka_pause_started_at is not null then public.business_minutes(pilka_pause_started_at, v_now) else 0 end,
      pilka_pause_started_at=null,
      kromka_status=case when coalesce(kromka_status, '') like '%Готово%' then kromka_status else '🔨 В работе' end,
      kromka_started_at=case when kromka_started_at is null then v_now else kromka_started_at end,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='✅ Готово',
      kromka_done_at=coalesce(kromka_done_at, v_now),
      kromka_pause_acc_min=kromka_pause_acc_min + case when kromka_pause_started_at is not null then public.business_minutes(kromka_pause_started_at, v_now) else 0 end,
      kromka_pause_started_at=null,
      pras_status=case when coalesce(pras_status, '') like '%Готово%' then pras_status else '🔨 В работе' end,
      pras_started_at=case when pras_started_at is null then v_now else pras_started_at end,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='✅ Готово',
      pras_done_at=coalesce(pras_done_at, v_now),
      pras_pause_acc_min=pras_pause_acc_min + case when pras_pause_started_at is not null then public.business_minutes(pras_pause_started_at, v_now) else 0 end,
      pras_pause_started_at=null,
      overall_status=case when coalesce(overall_status, '') like '%отправ%' then overall_status else '✅ Готово к сборке' end,
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;
  return v_row;
end;
$$;

create or replace function public.web_get_labor_table()
returns table (
  order_id text,
  item text,
  week text,
  qty numeric,
  pilka_min numeric,
  kromka_min numeric,
  pras_min numeric,
  assembly_min numeric,
  total_min numeric,
  date_finished date
)
language sql
stable
as $$
  with labor as (
    select
      o.order_id,
      o.item,
      o.week,
      o.qty,
      greatest(0, public.business_minutes(o.pilka_started_at, o.pilka_done_at) - coalesce(o.pilka_pause_acc_min, 0))::numeric as pilka_min,
      greatest(0, public.business_minutes(o.kromka_started_at, o.kromka_done_at) - coalesce(o.kromka_pause_acc_min, 0))::numeric as kromka_min,
      greatest(0, public.business_minutes(o.pras_started_at, o.pras_done_at) - coalesce(o.pras_pause_acc_min, 0))::numeric as pras_min
    from public.orders o
  )
  select
    l.order_id,
    l.item,
    l.week,
    l.qty,
    l.pilka_min,
    l.kromka_min,
    l.pras_min,
    0::numeric as assembly_min,
    (l.pilka_min + l.kromka_min + l.pras_min)::numeric as total_min,
    null::date as date_finished
  from labor l
  where (l.pilka_min + l.kromka_min + l.pras_min) > 0
  order by total_min desc, l.order_id;
$$;
