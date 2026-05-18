-- Упаковка: разные материалы одного изделия не должны сливаться в одну ячейку/заказ.
-- Баг: web_create_shipment_plan_cell искал ячейку без material → перезапись Бетон/Ясень.
-- Баг: web_send_shipment_to_work_by_source находил заказ только по source_row_id+week.

create or replace function public.web_create_shipment_plan_cell(
  p_section_name text,
  p_item text,
  p_material text,
  p_week text,
  p_qty numeric,
  p_format_type text default null
)
returns public.shipment_cells
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_section text := coalesce(nullif(trim(p_section_name), ''), 'Прочее');
  v_item text := coalesce(nullif(trim(p_item), ''), '');
  v_material text := nullif(trim(coalesce(p_material, '')), '');
  v_week text := coalesce(nullif(trim(p_week), ''), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_row_key text;
  v_col_key text;
  v_col_key_in text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_existing_row_key text;
  v_existing_col_key text;
  v_cell public.shipment_cells;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  v_col_key_in := public.web_norm_week_key(v_week);
  v_week := v_col_key_in;

  select spc.source_row_id, spc.source_col_id
    into v_existing_row_key, v_existing_col_key
  from public.shipment_plan_cells spc
  where public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
    and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
    and public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(v_material, ''))
    and (
      public.web_norm_week_key(spc.week) = v_col_key_in
      or public.web_norm_week_key(spc.source_col_id) = v_col_key_in
    )
  order by spc.updated_at desc nulls last, spc.id desc
  limit 1;

  v_row_key := coalesce(
    nullif(trim(v_existing_row_key), ''),
    'manual:' || substr(md5(lower(v_section || '|' || v_item || '|' || coalesce(v_material, ''))), 1, 16)
  );
  v_col_key := coalesce(nullif(trim(v_existing_col_key), ''), v_col_key_in);

  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, 0::numeric);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  insert into public.shipment_plan_cells (
    section_name, item, material, week, qty,
    row_ref, col_ref, source_row_id, source_col_id,
    bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_section, v_item, v_material, v_week, v_qty,
    v_row_key, v_col_key, v_row_key, v_col_key,
    '#ffffff', true, false, v_sheets_needed, 0, v_output_per_sheet, 'manual plan'
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    row_ref = excluded.row_ref,
    col_ref = excluded.col_ref,
    bg = '#ffffff',
    can_send_to_work = true,
    in_work = false,
    sheets_needed = excluded.sheets_needed,
    available_sheets = 0,
    output_per_sheet = excluded.output_per_sheet,
    note = 'manual plan',
    updated_at = now();

  select *
    into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key
    and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;

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

  if c.in_work then
    select * into v_row
    from public.orders o
    where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, ''))
      and trim(coalesce(o.week, '')) = v_week_norm
      and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(c.material, ''))
      and coalesce(o.shipped, false) = false
    order by o.created_at desc
    limit 1;

    if v_row.id is not null then
      if v_skip then
        v_row := public.web_skip_workshop_to_assembly(v_row.order_id);
      end if;
      return v_row;
    end if;

    raise exception 'Cell is already in work';
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

grant execute on function public.web_create_shipment_plan_cell(text, text, text, text, numeric, text)
  to anon, authenticated, service_role;
grant execute on function public.web_send_shipment_to_work_by_source(text, text, boolean)
  to anon, authenticated, service_role;

-- Вернуть «потерянный» заказ в очередь упаковки (сброс принятия).
create or replace function public.web_reset_replacement_order_packaging(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  update public.replacement_orders
  set packaging_accepted = false,
      status = '🟣 В упаковке',
      accepted_at = null
  where id = p_id
    and sent_to_work = true;
end;
$$;

grant execute on function public.web_reset_replacement_order_packaging(text)
  to anon, authenticated, service_role;
