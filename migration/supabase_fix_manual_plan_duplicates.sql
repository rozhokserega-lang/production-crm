create or replace function public.web_norm_item_key(p_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(replace(lower(coalesce(p_text, '')), 'х', 'x'), '\s+', ' ', 'g'))
$$;

create or replace function public.web_norm_week_key(p_week text)
returns text
language sql
immutable
as $$
  select coalesce(
    case
      when nullif(regexp_replace(coalesce(p_week, ''), '\D', '', 'g'), '') is not null
        then (nullif(regexp_replace(coalesce(p_week, ''), '\D', '', 'g'), ''))::int::text
      else nullif(trim(coalesce(p_week, '')), '')
    end,
    '0'
  )
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

grant execute on function public.web_norm_item_key(text) to anon, authenticated, service_role;
grant execute on function public.web_norm_week_key(text) to anon, authenticated, service_role;

with dupes as (
  select
    id,
    row_number() over (
      partition by public.web_norm_week_key(week), public.web_norm_item_key(section_name), public.web_norm_item_key(item)
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.shipment_plan_cells
  where coalesce(in_work, false) = false
)
delete from public.shipment_plan_cells sp
using dupes d
where sp.id = d.id
  and d.rn > 1;

with dupes as (
  select
    id,
    row_number() over (
      partition by public.web_norm_week_key(week), public.web_norm_item_key(section_name), public.web_norm_item_key(item)
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.shipment_cells
  where coalesce(in_work, false) = false
)
delete from public.shipment_cells sc
using dupes d
where sc.id = d.id
  and d.rn > 1;

create unique index if not exists ux_shipment_plan_cells_norm_unique
on public.shipment_plan_cells (
  public.web_norm_week_key(week),
  public.web_norm_item_key(section_name),
  public.web_norm_item_key(item),
  public.web_norm_item_key(material)
);

create unique index if not exists ux_shipment_cells_norm_unique
on public.shipment_cells (
  public.web_norm_week_key(week),
  public.web_norm_item_key(section_name),
  public.web_norm_item_key(item),
  public.web_norm_item_key(material)
);
