-- Подстатусы комплектации на складе: ожидание → в работе → готово.

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
  if o like '%комплектац%' then
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

create or replace function public.web_set_warehouse_kit_in_work(p_order_id text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin', 'warehouse']);

  update public.orders
  set overall_status = '🔨 В комплектации',
      updated_at = now()
  where order_id = trim(coalesce(p_order_id, ''))
    and pipeline_stage = 'warehouse_kit'
    and lower(coalesce(overall_status, '')) like '%на комплектации%'
  returning * into v_row;

  if v_row.order_id is null then
    raise exception 'Order not found or not in queue: %', p_order_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.web_set_warehouse_kit_done(p_order_id text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin', 'warehouse']);

  update public.orders
  set overall_status = '✅ Комплектация готова',
      updated_at = now()
  where order_id = trim(coalesce(p_order_id, ''))
    and pipeline_stage = 'warehouse_kit'
    and lower(coalesce(overall_status, '')) like '%в комплектации%'
  returning * into v_row;

  if v_row.order_id is null then
    raise exception 'Order not found or not in work: %', p_order_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.web_set_warehouse_kit_in_work(text) to anon, authenticated, service_role;
grant execute on function public.web_set_warehouse_kit_done(text) to anon, authenticated, service_role;
