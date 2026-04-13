-- RPC: web_set_stage_in_work / pause / done — в одной миграции для наката вручную или через Supabase SQL Editor.
-- Идемпотентно: CREATE OR REPLACE + IF NOT EXISTS для колонки.
-- Смысл: «Готово» на пиле/кромке не ставит следующий этап в «В работе»; optional p_executor; assembly + shipping.

alter table public.orders add column if not exists shipped boolean not null default false;
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
  cur_ts timestamp;
  end_ts timestamp;
  next_day timestamp;
  ws timestamp;
  we timestamp;
  ls timestamp;
  le timestamp;
  ds timestamp;
  de timestamp;
  total_minutes numeric := 0;
begin
  if p_start is null or p_end is null or p_start >= p_end then
    return 0;
  end if;
  -- Считаем в локальном московском времени.
  cur_ts := p_start at time zone 'Europe/Moscow';
  end_ts := p_end at time zone 'Europe/Moscow';
  while cur_ts < end_ts loop
    next_day := date_trunc('day', cur_ts) + interval '1 day';
    if extract(dow from cur_ts) <> 0 then
      ws := date_trunc('day', cur_ts) + interval '8 hour';
      we := date_trunc('day', cur_ts) + interval '18 hour';
      ls := date_trunc('day', cur_ts) + interval '12 hour';
      le := date_trunc('day', cur_ts) + interval '13 hour';
      ds := greatest(cur_ts, ws);
      de := least(end_ts, we);
      if ds < de then
        total_minutes := total_minutes + extract(epoch from (de - ds)) / 60.0;
        if greatest(ds, ls) < least(de, le) then
          total_minutes := total_minutes - extract(epoch from (least(de, le) - greatest(ds, ls))) / 60.0;
        end if;
      end if;
    end if;
    cur_ts := next_day;
  end loop;
  if total_minutes < 0 then
    total_minutes := 0;
  end if;
  if round(total_minutes) = 0 and end_ts > (p_start at time zone 'Europe/Moscow') then
    return 1;
  end if;
  return round(total_minutes)::integer;
end;
$$;

create or replace function public.web_set_stage_in_work(
  p_order_id text,
  p_stage text,
  p_executor text default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
  v_executor text := nullif(trim(coalesce(p_executor, '')), '');
  v_work_status text;
begin
  v_work_status := case
    when v_executor is null then '🔨 В работе'
    else '🔨 В работе (' || v_executor || ')'
  end;

  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status = v_work_status,
      pilka_started_at = coalesce(pilka_started_at, v_now),
      pilka_pause_acc_min = coalesce(pilka_pause_acc_min, 0) + case
        when pilka_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - pilka_pause_started_at)) / 60)::integer
        else 0
      end,
      pilka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status = v_work_status,
      kromka_started_at = coalesce(kromka_started_at, v_now),
      kromka_pause_acc_min = coalesce(kromka_pause_acc_min, 0) + case
        when kromka_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - kromka_pause_started_at)) / 60)::integer
        else 0
      end,
      kromka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status = v_work_status,
      pras_started_at = coalesce(pras_started_at, v_now),
      pras_pause_acc_min = coalesce(pras_pause_acc_min, 0) + case
        when pras_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - pras_pause_started_at)) / 60)::integer
        else 0
      end,
      pras_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;

  if v_row.id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.web_set_stage_pause(p_order_id text, p_stage text)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_row public.orders;
begin
  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='✅ Готово',
      pilka_done_at=now(),
      pilka_pause_acc_min = coalesce(pilka_pause_acc_min, 0) + case
        when pilka_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - pilka_pause_started_at)) / 60)::integer
        else 0
      end,
      pilka_pause_started_at = null,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='✅ Готово',
      kromka_done_at=now(),
      kromka_pause_acc_min = coalesce(kromka_pause_acc_min, 0) + case
        when kromka_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - kromka_pause_started_at)) / 60)::integer
        else 0
      end,
      kromka_pause_started_at = null,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='✅ Готово',
      pras_done_at=now(),
      pras_pause_acc_min = coalesce(pras_pause_acc_min, 0) + case
        when pras_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - pras_pause_started_at)) / 60)::integer
        else 0
      end,
      pras_pause_started_at = null,
      overall_status=case
        when coalesce(overall_status, '') like '%отправ%' then overall_status
        else '✅ Готово к сборке'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'assembly' then
    update public.orders
    set
      assembly_status='✅ СОБРАНО',
      overall_status=case
        when coalesce(overall_status, '') like '%отправ%' then overall_status
        else '✅ Готово к отправке'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'shipping' then
    update public.orders
    set
      overall_status='📦 На упаковке',
      shipped=true,
      updated_at=now()
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
      greatest(
        0,
        public.business_minutes(o.pilka_started_at, coalesce(o.pilka_done_at, now()))
        - (
          coalesce(o.pilka_pause_acc_min, 0)
          + case
              when o.pilka_pause_started_at is not null and o.pilka_done_at is null
              then greatest(0, extract(epoch from (now() - o.pilka_pause_started_at)) / 60)::integer
              else 0
            end
        )
      )::numeric as pilka_min,
      greatest(
        0,
        public.business_minutes(o.kromka_started_at, coalesce(o.kromka_done_at, now()))
        - (
          coalesce(o.kromka_pause_acc_min, 0)
          + case
              when o.kromka_pause_started_at is not null and o.kromka_done_at is null
              then greatest(0, extract(epoch from (now() - o.kromka_pause_started_at)) / 60)::integer
              else 0
            end
        )
      )::numeric as kromka_min,
      greatest(
        0,
        public.business_minutes(o.pras_started_at, coalesce(o.pras_done_at, now()))
        - (
          coalesce(o.pras_pause_acc_min, 0)
          + case
              when o.pras_pause_started_at is not null and o.pras_done_at is null
              then greatest(0, extract(epoch from (now() - o.pras_pause_started_at)) / 60)::integer
              else 0
            end
        )
      )::numeric as pras_min,
      greatest(coalesce(o.pilka_done_at, '-infinity'::timestamptz), coalesce(o.kromka_done_at, '-infinity'::timestamptz), coalesce(o.pras_done_at, '-infinity'::timestamptz)) as last_done_at
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
    case
      when l.last_done_at > '-infinity'::timestamptz then l.last_done_at::date
      else null::date
    end as date_finished
  from labor l
  where
    (l.pilka_min + l.kromka_min + l.pras_min) > 0
    or l.last_done_at > '-infinity'::timestamptz
  order by total_min desc, l.order_id;
$$;

create or replace function public.web_get_materials_stock()
returns table (
  material text,
  qty_sheets numeric,
  size_label text,
  sheet_width_mm integer,
  sheet_height_mm integer,
  updated_at timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
stable
as $$
  select
    ms.material,
    coalesce(ms.qty_sheets, 0)::numeric as qty_sheets,
    ms.size_label,
    ms.sheet_width_mm,
    ms.sheet_height_mm,
    ms.updated_at
  from public.materials_stock ms
  order by lower(coalesce(ms.material, ''));
$$;

grant execute on function public.web_set_stage_in_work(text, text, text) to authenticated, anon, service_role;
grant execute on function public.web_set_stage_pause(text, text) to authenticated, anon, service_role;
grant execute on function public.web_set_stage_done(text, text) to authenticated, anon, service_role;
grant execute on function public.web_get_labor_table() to authenticated, anon, service_role;
grant execute on function public.web_get_materials_stock() to authenticated, anon, service_role;
