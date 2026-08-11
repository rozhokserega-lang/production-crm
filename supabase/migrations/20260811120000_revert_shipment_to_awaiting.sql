-- Вернуть позицию отгрузки из «На пиле (ожидает запуск)» в «Ожидаю заказ»,
-- если пила ещё не начала резать (нет pilka_started_at / pilka_done_at).

create or replace function public.web_revert_shipment_to_awaiting(
  p_row text,
  p_col text
)
returns table(order_id text, reverted boolean)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_row text := trim(coalesce(p_row, ''));
  v_col text := trim(coalesce(p_col, ''));
  v_cell public.shipment_cells%rowtype;
  v_plan public.shipment_plan_cells%rowtype;
  v_order public.orders%rowtype;
  v_week_norm text;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_row = '' or v_col = '' then
    raise exception 'Row/col are required';
  end if;

  select * into v_cell
  from public.shipment_cells sc
  where trim(coalesce(sc.source_row_id, '')) = v_row
    and trim(coalesce(sc.source_col_id, '')) = v_col
  limit 1;

  if v_cell.id is null then
    select * into v_plan
    from public.shipment_plan_cells spc
    where trim(coalesce(spc.source_row_id, '')) = v_row
      and trim(coalesce(spc.source_col_id, '')) = v_col
    limit 1;

    if v_plan.id is null then
      raise exception 'Shipment cell not found: row %, col %', v_row, v_col;
    end if;

    v_week_norm := trim(coalesce(v_plan.week, ''));
  else
    v_week_norm := trim(coalesce(v_cell.week, ''));
    if not coalesce(v_cell.in_work, false) then
      raise exception 'Позиция не отправлена в работу';
    end if;
  end if;

  select o.* into v_order
  from public.orders o
  where coalesce(o.shipped, false) = false
    and coalesce(o.pipeline_stage, '') = 'pilka'
    and o.pilka_started_at is null
    and o.pilka_done_at is null
    and coalesce(o.pilka_status, '') not ilike '%в работе%'
    and coalesce(o.pilka_status, '') not ilike '%пауза%'
    and coalesce(o.pilka_status, '') not ilike '%готово%'
    and coalesce(o.pilka_status, '') not ilike '%✅%'
    and trim(coalesce(o.week, '')) = v_week_norm
    and (
      trim(coalesce(o.source_row_id, '')) = v_row
      or (
        v_cell.id is not null
        and public.web_norm_item_key(o.item) = public.web_norm_item_key(v_cell.item)
        and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(v_cell.material, ''))
      )
      or (
        v_cell.id is null
        and public.web_norm_item_key(o.item) = public.web_norm_item_key(v_plan.item)
        and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(v_plan.material, ''))
      )
    )
  order by o.created_at desc
  limit 1;

  if v_order.order_id is null then
    raise exception 'Нельзя вернуть: заказ не найден или пила уже начата';
  end if;

  delete from public.labor_facts where order_id = v_order.order_id;
  delete from public.materials_leftovers where order_id = v_order.order_id;
  delete from public.plank_batches where order_id = v_order.order_id;
  delete from public.orders where order_id = v_order.order_id;

  update public.shipment_cells
  set
    in_work = false,
    can_send_to_work = true,
    bg_color = '#ffffff',
    updated_at = now()
  where trim(coalesce(source_row_id, '')) = v_row
    and trim(coalesce(source_col_id, '')) = v_col;

  update public.shipment_plan_cells
  set
    in_work = false,
    can_send_to_work = true,
    bg = '#ffffff',
    updated_at = now()
  where trim(coalesce(source_row_id, '')) = v_row
    and trim(coalesce(source_col_id, '')) = v_col;

  return query select v_order.order_id, true;
end;
$$;

grant execute on function public.web_revert_shipment_to_awaiting(text, text)
  to anon, authenticated, service_role;
