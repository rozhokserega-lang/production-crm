create or replace function public.web_get_shipment_table()
returns table(
  section_name text,
  row_ref text,
  item text,
  material text,
  week text,
  qty numeric,
  bg text,
  can_send_to_work boolean,
  in_work boolean,
  sheets_needed numeric,
  available_sheets numeric,
  material_enough_for_order boolean,
  source_row_id text,
  source_col_id text,
  note text
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with src as (
    select
      coalesce(spc.section_name, 'Прочее') as section_name,
      coalesce(spc.row_ref, spc.id::text) as row_ref,
      spc.item,
      coalesce(nullif(spc.material, ''), icm.color_name, '') as material,
      spc.week,
      spc.qty,
      coalesce(spc.bg, '#ffffff') as bg,
      spc.can_send_to_work,
      spc.in_work,
      coalesce(spc.sheets_needed, 0) as sheets_needed_raw,
      coalesce(spc.available_sheets, 0) as available_sheets_raw,
      spc.source_row_id,
      spc.source_col_id,
      spc.note,
      ms.qty_sheets as stock_qty,
      fsc.output_per_sheet as capacity_output_per_sheet,
      spc.updated_at,
      spc.id as plan_id
    from public.shipment_plan_cells spc
    left join public.item_color_map icm
      on lower(trim(icm.item_name)) = lower(trim(spc.item))
    left join lateral (
      select ms1.qty_sheets, ms1.size_label
      from public.materials_stock ms1
      where public.web_normalize_material_name(ms1.material)
        = public.web_normalize_material_name(coalesce(nullif(spc.material, ''), icm.color_name, ''))
      order by
        case
          when lower(trim(coalesce(ms1.material, ''))) = lower(trim(coalesce(nullif(spc.material, ''), icm.color_name, ''))) then 0
          else 1
        end,
        coalesce(ms1.qty_sheets, 0) desc,
        ms1.updated_at desc nulls last
      limit 1
    ) ms on true
    left join public.furniture_sheet_capacity fsc
      on lower(trim(fsc.furniture_model)) = lower(trim(public.web_normalize_furniture_model(spc.section_name)))
     and fsc.sheet_size = ms.size_label
    where coalesce(spc.qty, 0) > 0
  ),
  ranked as (
    select
      src.*,
      row_number() over (
        partition by
          public.web_norm_week_key(src.week),
          public.web_norm_item_key(src.section_name),
          public.web_norm_item_key(src.item),
          public.web_norm_item_key(src.material)
        order by src.updated_at desc nulls last, src.plan_id desc
      ) as rn
    from src
  )
  select
    section_name,
    row_ref,
    item,
    material,
    week,
    qty,
    bg,
    can_send_to_work,
    in_work,
    case
      when sheets_needed_raw > 0 then sheets_needed_raw
      when qty > 0 and coalesce(capacity_output_per_sheet, 0) > 0 then ceil(qty / capacity_output_per_sheet)
      else 0
    end as sheets_needed,
    coalesce(nullif(available_sheets_raw, 0), stock_qty, 0) as available_sheets,
    (
      case
        when sheets_needed_raw > 0 then sheets_needed_raw
        when qty > 0 and coalesce(capacity_output_per_sheet, 0) > 0 then ceil(qty / capacity_output_per_sheet)
        else 0
      end
      <=
      coalesce(nullif(available_sheets_raw, 0), stock_qty, 0)
    ) as material_enough_for_order,
    source_row_id,
    source_col_id,
    note
  from ranked
  where rn = 1
  order by section_name, item, week;
$$;

grant execute on function public.web_get_shipment_table() to anon, authenticated, service_role;
