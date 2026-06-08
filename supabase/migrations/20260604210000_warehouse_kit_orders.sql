-- Финал цеха → склад (комплектация фурнитурой), не сразу в «Отгружено».

-- 1. Этап pipeline: warehouse_kit
create or replace function public.compute_order_pipeline_stage(
  p_overall text,
  p_assembly text,
  p_pilka text,
  p_kromka text,
  p_pras text
)
returns text
language plpgsql
stable
as $$
declare
  o text := lower(coalesce(p_overall, ''));
  a text := lower(coalesce(p_assembly, ''));
  pk text := lower(coalesce(p_pilka, ''));
  kr text := lower(coalesce(p_kromka, ''));
  pr text := lower(coalesce(p_pras, ''));
  pk_d boolean;
  kr_d boolean;
  pr_d boolean;
begin
  if o like '%на комплектации%' then
    return 'warehouse_kit';
  end if;

  if o like '%готово к отправке%' then
    return 'ready_to_ship';
  end if;

  if o not like '%на пилу%'
     and (o like '%отгруж%' or o like '%упаков%' or o like '%отправ%') then
    return 'shipped';
  end if;

  if a like '%собрано%' then
    return 'assembled';
  end if;

  pk_d := (pk like '%готов%' or pk like '%собрано%');
  kr_d := (kr like '%готов%' or kr like '%собрано%');
  pr_d := (pr like '%готов%' or pr like '%собрано%');

  if pk_d and kr_d and pr_d then
    return 'workshop_complete';
  end if;

  if pr like '%в работе%' or pr like '%пауза%' or (pk_d and kr_d and not pr_d) then
    return 'pras';
  end if;

  if kr like '%в работе%' or kr like '%пауза%' or (pk_d and not kr_d) then
    return 'kromka';
  end if;

  return 'pilka';
end;
$$;

comment on column public.orders.pipeline_stage is
  'Машинный этап: pilka|kromka|pras|workshop_complete|assembled|warehouse_kit|ready_to_ship|shipped';

-- 2. Закрытие финала → на комплектацию (без shipped=true)
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
  return v_row;
end;
$$;

-- 3. Частичный финал тоже на склад
create or replace function public.web_finalize_workshop_order(
  p_order_id text,
  p_qty_ready numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_total numeric;
  v_ready numeric;
  v_debt numeric;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  select * into v_order
  from public.orders
  where trim(coalesce(order_id, '')) = trim(coalesce(p_order_id, ''))
  for update;

  if v_order.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if coalesce(v_order.shipped, false) = true then
    raise exception 'Order already shipped: %', p_order_id;
  end if;

  v_total := greatest(0, coalesce(v_order.qty, 0));
  v_ready := greatest(0, least(coalesce(p_qty_ready, v_total), v_total));
  v_debt := v_total - v_ready;

  if v_ready <= 0 then
    raise exception 'Qty ready must be > 0';
  end if;

  if v_debt > 0 then
    insert into public.production_plan_debts (
      order_id, item, material, week, qty, product_article, note
    )
    values (
      v_order.order_id,
      coalesce(v_order.item, ''),
      coalesce(v_order.material, ''),
      coalesce(v_order.week, ''),
      v_debt::integer,
      coalesce(v_order.product_article, ''),
      'недовыпуск при финале'
    );
  end if;

  update public.orders
  set qty = v_ready,
      updated_at = now()
  where order_id = v_order.order_id
  returning * into v_order;

  perform public.web_set_stage_done(v_order.order_id, 'warehouse_kit');

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'qtyReady', v_ready,
    'qtyDebt', v_debt,
    'week', coalesce(v_order.week, ''),
    'item', coalesce(v_order.item, '')
  );
end;
$$;

-- 4. Список заказов на комплектации для вкладки «Склад → Заказы»
create or replace function public.web_get_warehouse_kit_orders()
returns table (
  order_id text,
  source_row_id text,
  item text,
  material text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  sheets_needed numeric,
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'warehouse_kit'
  order by o.updated_at desc nulls last, o.order_id;
$$;

grant execute on function public.web_get_warehouse_kit_orders() to anon, authenticated, service_role;
