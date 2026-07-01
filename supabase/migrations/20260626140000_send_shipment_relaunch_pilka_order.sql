-- Повторная отправка в работу: не переиспользовать заказ, если пила уже пройдена.
-- Иначе обвязка (и другие relaunch) «уходят в работу», но не попадают на вкладку «Пила».

create or replace function public.web_send_shipment_to_work_by_source(
  p_row text,
  p_col text,
  p_skip_workshop boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  c public.shipment_cells%rowtype;
  p public.shipment_plan_cells%rowtype;
  v_order_id text;
  v_row public.orders;
  v_week_norm text;
  v_skip boolean := coalesce(p_skip_workshop, false);
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  select * into c
  from public.shipment_cells
  where source_row_id = p_row and source_col_id = p_col
  for update;

  if c.id is null then
    select * into p
    from public.shipment_plan_cells
    where source_row_id = p_row and source_col_id = p_col
    limit 1;

    if p.id is null then
      raise exception 'Shipment cell not found: row %, col %', p_row, p_col;
    end if;

    insert into public.shipment_cells (
      source_row_id, source_col_id, section_name, item, material, week, qty,
      bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      p.source_row_id, p.source_col_id, p.section_name, p.item, p.material, p.week, p.qty,
      coalesce(p.bg, '#ffffff'), true, false,
      coalesce(p.sheets_needed, 0), coalesce(p.available_sheets, 0), 0,
      coalesce(nullif(p.note, ''), 'copied from shipment_plan_cells')
    )
    on conflict (source_row_id, source_col_id)
    do update set
      section_name = excluded.section_name,
      item = excluded.item,
      material = excluded.material,
      week = excluded.week,
      qty = excluded.qty,
      bg_color = excluded.bg_color,
      can_send_to_work = true,
      in_work = false,
      sheets_needed = excluded.sheets_needed,
      available_sheets = excluded.available_sheets,
      output_per_sheet = excluded.output_per_sheet,
      note = excluded.note,
      updated_at = now();

    select * into c
    from public.shipment_cells
    where source_row_id = p_row and source_col_id = p_col
    for update;
  end if;

  if coalesce(c.qty, 0) <= 0 then
    raise exception 'Qty is empty';
  end if;

  v_week_norm := trim(coalesce(c.week, ''));

  select * into v_row
  from public.orders o
  where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, ''))
    and trim(coalesce(o.week, '')) = v_week_norm
    and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(c.material, ''))
    and coalesce(o.shipped, false) = false
    and coalesce(o.pipeline_stage, '') = 'pilka'
    and coalesce(o.pilka_status, '') not ilike '%готово%'
    and coalesce(o.pilka_status, '') not ilike '%✅%'
  order by o.created_at desc
  limit 1;

  if v_row.id is not null then
    update public.orders
    set
      item = c.item,
      material = coalesce(c.material, material),
      qty = c.qty,
      updated_at = now()
    where order_id = v_row.order_id
    returning * into v_row;

    if v_skip then
      v_row := public.web_skip_workshop_to_assembly(v_row.order_id);
    end if;

    update public.shipment_cells
      set in_work = true, can_send_to_work = false, bg_color = '#ffff00', updated_at = now()
      where id = c.id;

    update public.shipment_plan_cells
      set in_work = true, can_send_to_work = false, bg = '#ffff00', updated_at = now()
      where source_row_id = p_row and source_col_id = p_col;

    return v_row;
  end if;

  v_order_id := 'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (
    order_id, source, source_row_id, item, material, week, qty,
    pilka_status, kromka_status, pras_status, assembly_status, overall_status
  )
  values (
    v_order_id, 'supabase', c.source_row_id, c.item, c.material, c.week, c.qty,
    case when v_skip then 'Готово' else '⏳ Ожидает пилу' end,
    case when v_skip then 'Готово' else '⏳ Ожидает' end,
    case when v_skip then 'Готово' else '⏳ Ожидает' end,
    '⏳ Ожидает',
    case when v_skip then '🟡 К сборке' else '🟡 Отправлен на пилу' end
  )
  returning * into v_row;

  update public.shipment_cells
    set in_work = true, can_send_to_work = false, bg_color = '#ffff00', updated_at = now()
    where id = c.id;

  update public.shipment_plan_cells
    set in_work = true, can_send_to_work = false, bg = '#ffff00', updated_at = now()
    where source_row_id = p_row and source_col_id = p_col;

  return v_row;
end;
$$;

grant execute on function public.web_send_shipment_to_work_by_source(text, text, boolean)
  to anon, authenticated, service_role;
