-- Редактирование позиции плана отгрузки до отправки в работу

create or replace function public.web_update_shipment_plan_cell_by_source(
  p_row text,
  p_col text,
  p_section_name text,
  p_item text,
  p_material text,
  p_week text,
  p_qty numeric
)
returns public.shipment_cells
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_src public.shipment_plan_cells%rowtype;
  v_section text := coalesce(nullif(trim(p_section_name), ''), 'Прочее');
  v_item text := coalesce(nullif(trim(p_item), ''), '');
  v_material text := nullif(trim(coalesce(p_material, '')), '');
  v_week text := coalesce(nullif(trim(p_week), ''), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_col_key text;
  v_row_key text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_cell public.shipment_cells;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if coalesce(trim(p_row), '') = '' or coalesce(trim(p_col), '') = '' then
    raise exception 'Row/col are required';
  end if;
  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  select *
    into v_src
  from public.shipment_plan_cells spc
  where spc.source_row_id = trim(p_row)
    and spc.source_col_id = trim(p_col)
  limit 1;

  if not found then
    raise exception 'Ячейка плана не найдена: row %, col %', p_row, p_col;
  end if;

  if coalesce(v_src.in_work, false) or not coalesce(v_src.can_send_to_work, false) then
    raise exception 'Позиция недоступна для редактирования (уже в работе или закрыта)';
  end if;

  if public.web_plan_cell_has_active_order(
    v_src.source_row_id, v_src.item, v_src.material, v_src.week
  ) then
    raise exception 'Нельзя редактировать: есть активный заказ в производстве';
  end if;

  v_col_key := public.web_norm_week_key(v_week);
  v_week := v_col_key;
  v_row_key := trim(p_row);
  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, 0::numeric);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  if v_col_key <> trim(p_col) then
    delete from public.shipment_plan_cells
    where source_row_id = v_row_key
      and source_col_id = trim(p_col);

    delete from public.shipment_cells
    where source_row_id = v_row_key
      and source_col_id = trim(p_col)
      and coalesce(in_work, false) = false;

    insert into public.shipment_plan_cells (
      section_name, item, material, week, qty,
      row_ref, col_ref, source_row_id, source_col_id,
      bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      v_section, v_item, v_material, v_week, v_qty,
      v_row_key, v_col_key, v_row_key, v_col_key,
      coalesce(nullif(trim(v_src.bg), ''), '#ffffff'), true, false,
      v_sheets_needed, coalesce(v_src.available_sheets, 0), v_output_per_sheet,
      coalesce(nullif(trim(v_src.note), ''), 'manual plan')
    )
    on conflict (source_row_id, source_col_id)
    do update set
      section_name = excluded.section_name,
      item = excluded.item,
      material = excluded.material,
      week = excluded.week,
      qty = excluded.qty,
      sheets_needed = excluded.sheets_needed,
      output_per_sheet = excluded.output_per_sheet,
      can_send_to_work = true,
      in_work = false,
      updated_at = now();

    insert into public.shipment_cells (
      source_row_id, source_col_id, section_name, item, material, week, qty,
      bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      v_row_key, v_col_key, v_section, v_item, v_material, v_week, v_qty,
      coalesce(nullif(trim(v_src.bg), ''), '#ffffff'), true, false,
      v_sheets_needed, coalesce(v_src.available_sheets, 0), v_output_per_sheet,
      coalesce(nullif(trim(v_src.note), ''), 'manual plan')
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
      can_send_to_work = true,
      in_work = false,
      note = excluded.note,
      updated_at = now();
  else
    update public.shipment_plan_cells
    set section_name = v_section,
        item = v_item,
        material = v_material,
        week = v_week,
        qty = v_qty,
        sheets_needed = v_sheets_needed,
        output_per_sheet = v_output_per_sheet,
        can_send_to_work = true,
        in_work = false,
        updated_at = now()
    where source_row_id = v_row_key
      and source_col_id = trim(p_col);

    update public.shipment_cells
    set section_name = v_section,
        item = v_item,
        material = v_material,
        week = v_week,
        qty = v_qty,
        sheets_needed = v_sheets_needed,
        output_per_sheet = v_output_per_sheet,
        can_send_to_work = true,
        in_work = false,
        updated_at = now()
    where source_row_id = v_row_key
      and source_col_id = trim(p_col)
      and coalesce(in_work, false) = false;
  end if;

  select *
    into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key
    and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;

grant execute on function public.web_update_shipment_plan_cell_by_source(
  text, text, text, text, text, text, numeric
) to anon, authenticated, service_role;
