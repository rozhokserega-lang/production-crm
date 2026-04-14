create or replace function public.web_norm_item_key(p_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(replace(lower(coalesce(p_text, '')), 'х', 'x'), '\s+', ' ', 'g'))
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
  v_format_type text := lower(trim(coalesce(p_format_type, '')));
  v_row_key text;
  v_col_key text;
  v_col_num text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_existing_row_key text;
  v_cell public.shipment_cells;
begin
  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  if v_format_type not in ('', 'large', 'small') then
    raise exception 'format_type must be large or small';
  end if;

  v_col_num := nullif(regexp_replace(v_week, '\D', '', 'g'), '');
  v_col_key := coalesce(v_col_num, '0');

  select spc.source_row_id
    into v_existing_row_key
  from public.shipment_plan_cells spc
  where spc.source_col_id = v_col_key
    and public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
    and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
  order by spc.updated_at desc nulls last, spc.id desc
  limit 1;

  v_row_key := coalesce(
    nullif(trim(v_existing_row_key), ''),
    'manual:' || substr(md5(lower(v_section || '|' || v_item || '|' || coalesce(v_material, ''))), 1, 16)
  );

  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, nullif(v_format_type, ''), 0);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  insert into public.shipment_plan_cells (
    section_name, item, material, week, qty, format_type,
    row_ref, col_ref, source_row_id, source_col_id,
    bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_section, v_item, v_material, v_week, v_qty, nullif(v_format_type, ''),
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
    format_type = excluded.format_type,
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

grant execute on function public.web_norm_item_key(text) to anon, authenticated, service_role;

with dupes as (
  select
    source_row_id,
    source_col_id,
    row_number() over (
      partition by source_col_id, public.web_norm_item_key(section_name), public.web_norm_item_key(item)
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.shipment_plan_cells
  where coalesce(in_work, false) = false
)
delete from public.shipment_plan_cells sp
using dupes d
where sp.source_row_id = d.source_row_id
  and sp.source_col_id = d.source_col_id
  and d.rn > 1;
