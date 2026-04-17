-- Prevent collapsing different plan weeks into one order.
-- Before: idempotency matched active order only by source_row_id.
-- After:  idempotency matches by source_row_id + week.

create or replace function public.web_send_shipment_to_work_by_source(
  p_row text,
  p_col text
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

  -- Idempotency must be scoped to row+week, otherwise different
  -- plan columns (e.g. week 68 and 71) collapse into one order.
  select * into v_row
  from public.orders o
  where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, ''))
    and trim(coalesce(o.week, '')) = v_week_norm
    and coalesce(o.shipped, false) = false
  order by o.created_at desc
  limit 1;

  if v_row.id is not null then
    update public.shipment_cells
      set in_work = true, can_send_to_work = false, bg_color = '#ffff00', updated_at = now()
      where id = c.id;

    update public.shipment_plan_cells
      set in_work = true, can_send_to_work = false, bg = '#ffff00', updated_at = now()
      where source_row_id = p_row and source_col_id = p_col;

    return v_row;
  end if;

  if c.in_work then
    raise exception 'Cell is already in work';
  end if;

  v_order_id := 'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (
    order_id, source, source_row_id, item, material, week, qty,
    pilka_status, kromka_status, pras_status, assembly_status, overall_status
  )
  values (
    v_order_id, 'supabase', c.source_row_id, c.item, c.material, c.week, c.qty,
    '⏳ Ожидает пилу', '⏳ Ожидает', '⏳ Ожидает', '⏳ Ожидает', '🟡 Отправлен на пилу'
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

grant execute on function public.web_send_shipment_to_work_by_source(text, text) to anon, authenticated, service_role;
