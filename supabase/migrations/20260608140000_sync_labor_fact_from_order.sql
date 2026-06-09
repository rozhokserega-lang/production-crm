-- Шаг 1: автосинхронизация фактических нормо-часов из orders → labor_facts.

-- ---------------------------------------------------------------------------
-- 1. Вычисление чистого времени этапа (рабочие минуты − накопленные паузы)
-- ---------------------------------------------------------------------------
create or replace function public.compute_order_stage_labor_minutes(
  p_started_at timestamptz,
  p_done_at timestamptz,
  p_pause_acc_min integer
)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_started_at is null or p_done_at is null then 0::numeric
    else greatest(
      0::numeric,
      public.business_minutes(p_started_at, p_done_at)::numeric
        - coalesce(p_pause_acc_min, 0)::numeric
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Синхронизация labor_facts по заказу (все закрытые этапы цеха)
-- ---------------------------------------------------------------------------
create or replace function public.sync_labor_fact_from_order(p_order_id text)
returns public.labor_facts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.labor_facts%rowtype;
  v_pilka numeric := 0;
  v_kromka numeric := 0;
  v_pras numeric := 0;
  v_assembly numeric := 0;
  v_date date;
  v_row public.labor_facts%rowtype;
begin
  select * into v_order
  from public.orders
  where order_id = trim(coalesce(p_order_id, ''))
  limit 1;

  if v_order.order_id is null then
    return null;
  end if;

  select * into v_existing
  from public.labor_facts
  where order_id = v_order.order_id;

  if v_order.pilka_done_at is not null then
    v_pilka := public.compute_order_stage_labor_minutes(
      v_order.pilka_started_at,
      v_order.pilka_done_at,
      v_order.pilka_pause_acc_min
    );
  elsif v_existing.order_id is not null then
    v_pilka := coalesce(v_existing.pilka_min, 0);
  end if;

  if v_order.kromka_done_at is not null then
    v_kromka := public.compute_order_stage_labor_minutes(
      v_order.kromka_started_at,
      v_order.kromka_done_at,
      v_order.kromka_pause_acc_min
    );
  elsif v_existing.order_id is not null then
    v_kromka := coalesce(v_existing.kromka_min, 0);
  end if;

  if v_order.pras_done_at is not null then
    v_pras := public.compute_order_stage_labor_minutes(
      v_order.pras_started_at,
      v_order.pras_done_at,
      v_order.pras_pause_acc_min
    );
  elsif v_existing.order_id is not null then
    v_pras := coalesce(v_existing.pras_min, 0);
  end if;

  -- Сборка: пока нет started_at/done_at в orders — сохраняем ручной ввод.
  v_assembly := coalesce(v_existing.assembly_min, 0);

  if v_pilka <= 0 and v_kromka <= 0 and v_pras <= 0 and v_assembly <= 0 then
    return v_existing;
  end if;

  v_date := greatest(
    case when v_order.pilka_done_at is not null then v_order.pilka_done_at::date end,
    case when v_order.kromka_done_at is not null then v_order.kromka_done_at::date end,
    case when v_order.pras_done_at is not null then v_order.pras_done_at::date end
  );

  insert into public.labor_facts (
    order_id,
    item,
    week,
    qty,
    pilka_min,
    kromka_min,
    pras_min,
    assembly_min,
    date_finished
  )
  values (
    v_order.order_id,
    nullif(trim(coalesce(v_order.item, '')), ''),
    nullif(trim(coalesce(v_order.week, '')), ''),
    greatest(0, coalesce(v_order.qty, 0)),
    v_pilka,
    v_kromka,
    v_pras,
    v_assembly,
    v_date
  )
  on conflict (order_id)
  do update
    set item = excluded.item,
        week = excluded.week,
        qty = excluded.qty,
        pilka_min = excluded.pilka_min,
        kromka_min = excluded.kromka_min,
        pras_min = excluded.pras_min,
        assembly_min = excluded.assembly_min,
        date_finished = excluded.date_finished,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Ручной пересчёт (админ / отладка / бэкфилл)
create or replace function public.web_sync_labor_fact_from_order(p_order_id text)
returns public.labor_facts
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  return public.sync_labor_fact_from_order(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. web_set_stage_done: после закрытия этапа цеха — пишем факт
-- ---------------------------------------------------------------------------
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
  elsif p_stage = 'warehouse_kit' then
    update public.orders
    set
      overall_status='📦 На комплектации',
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

  if v_row.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if p_stage in ('pilka', 'kromka', 'pras') then
    perform public.sync_labor_fact_from_order(v_row.order_id);
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Единый источник для UI: labor_facts (не live-расчёт из orders)
-- ---------------------------------------------------------------------------
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
security definer
set search_path = public
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
  order by lf.date_finished desc nulls last, lf.total_min desc nulls last, lf.order_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Бэкфилл: накопить факт по уже закрытым этапам
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r record;
begin
  for r in
    select o.order_id
    from public.orders o
    where o.pilka_done_at is not null
       or o.kromka_done_at is not null
       or o.pras_done_at is not null
  loop
    perform public.sync_labor_fact_from_order(r.order_id);
  end loop;
end $backfill$;

grant execute on function public.web_sync_labor_fact_from_order(text) to anon, authenticated, service_role;
