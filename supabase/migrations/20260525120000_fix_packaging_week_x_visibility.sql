-- Упаковка: неделя «X» и возврат ключей ячейки из web_create_shipment_plan_cell.

create or replace function public.web_shipment_col_num(p_col text)
returns integer
language sql
immutable
as $$
  select case
    when nullif(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g'), '') is not null
      and length(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g')) between 1 and 9
      then nullif(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g'), '')::integer
    else null
  end;
$$;

create or replace function public.web_get_shipment_board()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with cells as (
    select
      coalesce(nullif(section_name, ''), 'Прочее') as section_name,
      coalesce(nullif(item, ''), 'Без названия') as item,
      coalesce(nullif(material, ''), '') as material,
      coalesce(source_row_id, '0') as source_row_id,
      coalesce(source_col_id, '0') as source_col_id,
      public.web_shipment_col_num(source_col_id) as source_col_num,
      (mod(abs(hashtextextended(coalesce(source_row_id, '0'), 0)), 1000000000))::int as source_row_num,
      coalesce(week, '') as week,
      coalesce(qty, 0) as qty,
      public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)) as output_per_sheet,
      case
        when coalesce(sheets_needed, 0) > 0 then coalesce(sheets_needed, 0)
        when public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)) > 0
          and coalesce(qty, 0) > 0
          then ceil(coalesce(qty, 0) / public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)))
        else 0
      end as sheets_needed,
      coalesce(available_sheets, 0) as available_sheets,
      (coalesce(sheets_needed, 0) <= coalesce(available_sheets, 0)) as material_enough_for_order,
      coalesce(bg, '#ffffff') as bg,
      coalesce(note, '') as note,
      coalesce(in_work, false) as in_work,
      coalesce(can_send_to_work, false) as can_send_to_work
    from public.shipment_plan_cells
    where coalesce(qty, 0) > 0
  ),
  grouped_items as (
    select
      section_name,
      item,
      material,
      source_row_id,
      coalesce(source_row_num, 0) as source_row_num,
      jsonb_agg(
        jsonb_build_object(
          'col', coalesce(source_col_num, 0),
          'sourceColId', source_col_id,
          'week', week,
          'qty', qty,
          'outputPerSheet', output_per_sheet,
          'sheetsNeeded', sheets_needed,
          'availableSheets', available_sheets,
          'materialEnoughForOrder', material_enough_for_order,
          'bg', bg,
          'note', note,
          'inWork', in_work,
          'canSendToWork', can_send_to_work
        )
        order by coalesce(source_col_num, 0), week
      ) as cells
    from cells
    group by section_name, item, material, source_row_id, source_row_num
  ),
  grouped_sections as (
    select
      section_name as name,
      jsonb_agg(
        jsonb_build_object(
          'row', coalesce(source_row_num, 0),
          'sourceRowId', source_row_id,
          'item', item,
          'material', material,
          'cells', cells
        )
        order by item, coalesce(source_row_num, 0)
      ) as items
    from grouped_items
    group by section_name
  )
  select jsonb_build_object(
    'weeks', (
      select coalesce(
        jsonb_agg(jsonb_build_object('col', w.col, 'week', w.week) order by w.col, w.week),
        '[]'::jsonb
      )
      from (
        select distinct coalesce(source_col_num, 0) as col, week
        from cells
      ) w
    ),
    'sections',
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('name', name, 'items', items) order by name)
        from grouped_sections
      ),
      '[]'::jsonb
    )
  );
$$;

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

  insert into public.shipment_cells (
    source_row_id, source_col_id, section_name, item, material, week, qty,
    bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_row_key, v_col_key, v_section, v_item, v_material, v_week, v_qty,
    '#ffffff', true, false, v_sheets_needed, 0, v_output_per_sheet, 'manual plan'
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    sheets_needed = excluded.sheets_needed,
    available_sheets = excluded.available_sheets,
    output_per_sheet = excluded.output_per_sheet,
    note = excluded.note,
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

grant execute on function public.web_shipment_col_num(text) to anon, authenticated, service_role;
grant execute on function public.web_get_shipment_board() to anon, authenticated, service_role;
grant execute on function public.web_create_shipment_plan_cell(text, text, text, text, numeric, text)
  to anon, authenticated, service_role;
