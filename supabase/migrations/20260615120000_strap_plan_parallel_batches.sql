-- Повторный пуск обвязки: не перезаписывать ячейку, пока предыдущая партия в работе.
-- Раньше web_create_shipment_plan_cell находил ту же norm-ячейку и делал upsert по qty,
-- а уникальный индекс по (week, section, item, material) не давал завести вторую позицию.

drop index if exists public.ux_shipment_plan_cells_norm_unique;
drop index if exists public.ux_shipment_cells_norm_unique;

create or replace function public.web_plan_cell_has_active_order(
  p_source_row_id text,
  p_item text,
  p_material text,
  p_week text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.orders o
    where coalesce(o.shipped, false) = false
      and coalesce(o.pipeline_stage, '') <> 'shipped'
      and trim(coalesce(o.week, '')) = trim(coalesce(p_week, ''))
      and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(p_material, ''))
      and (
        (
          coalesce(trim(p_source_row_id), '') <> ''
          and trim(coalesce(o.source_row_id, '')) = trim(p_source_row_id)
        )
        or public.web_norm_item_key(o.item) = public.web_norm_item_key(p_item)
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
  v_force_new boolean := false;
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

  select exists (
    select 1
    from public.shipment_plan_cells spc
    where public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
      and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
      and public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(v_material, ''))
      and (
        public.web_norm_week_key(spc.week) = v_col_key_in
        or public.web_norm_week_key(spc.source_col_id) = v_col_key_in
      )
      and (
        coalesce(spc.in_work, false) = true
        or public.web_plan_cell_has_active_order(
          spc.source_row_id, spc.item, spc.material, spc.week
        )
      )
  )
  into v_force_new;

  if not v_force_new then
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
      and coalesce(spc.in_work, false) = false
      and coalesce(spc.can_send_to_work, false) = true
      and not public.web_plan_cell_has_active_order(
        spc.source_row_id, spc.item, spc.material, spc.week
      )
    order by spc.updated_at desc nulls last, spc.id desc
    limit 1;
  end if;

  v_row_key := coalesce(
    nullif(trim(v_existing_row_key), ''),
    'manual:' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
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

grant execute on function public.web_plan_cell_has_active_order(text, text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.web_create_shipment_plan_cell(text, text, text, text, numeric, text)
  to anon, authenticated, service_role;
