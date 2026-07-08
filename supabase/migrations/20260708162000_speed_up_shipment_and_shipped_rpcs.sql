-- Same optimization as web_get_orders_all (20260708160000): precompute
-- normalized keys once per lookup table instead of re-running regexp-based
-- normalization functions for every row pair; inline resolve_color_name()
-- against the precomputed color map. Outputs verified identical to previous
-- versions (EXCEPT in both directions = 0 rows).
-- Timings: web_get_shipment_table 917ms -> ~225ms, web_get_orders_shipped
-- 235ms -> 17ms, web_get_warehouse_kit_orders ~200ms -> 14ms.
-- Applied to nsdwypcbhmfseotclkrm via MCP apply_migration on 2026-07-08.

create or replace function public.web_get_orders_shipped()
 returns table(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamptz, updated_at timestamptz)
 language sql
 stable
as $function$
  with color_norm as materialized (
    select
      m.color_name::text as color_name,
      public.normalize_item_key(m.item_name) as item_key,
      case when m.source = 'manual' then 0 else 1 end as manual_rank,
      m.updated_at
    from public.item_color_map m
  ),
  orders_keyed as materialized (
    select o.*, public.normalize_item_key(o.item) as n_item_key
    from public.orders o
    where o.pipeline_stage = 'shipped'
  )
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    coalesce(
      (select c.color_name from color_norm c where c.item_key = o.n_item_key
         order by c.manual_rank, c.updated_at desc nulls last limit 1),
      (select c.color_name from color_norm c where o.n_item_key like ('%' || c.item_key || '%')
         order by length(c.item_key) desc, c.manual_rank, c.updated_at desc nulls last limit 1)
    ) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from orders_keyed o
  order by o.updated_at desc nulls last, o.order_id;
$function$;

create or replace function public.web_get_warehouse_kit_orders()
 returns table(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamptz, updated_at timestamptz)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with color_norm as materialized (
    select
      m.color_name::text as color_name,
      public.normalize_item_key(m.item_name) as item_key,
      case when m.source = 'manual' then 0 else 1 end as manual_rank,
      m.updated_at
    from public.item_color_map m
  ),
  orders_keyed as materialized (
    select o.*, public.normalize_item_key(o.item) as n_item_key
    from public.orders o
    where o.pipeline_stage = 'warehouse_kit'
  )
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    coalesce(
      (select c.color_name from color_norm c where c.item_key = o.n_item_key
         order by c.manual_rank, c.updated_at desc nulls last limit 1),
      (select c.color_name from color_norm c where o.n_item_key like ('%' || c.item_key || '%')
         order by length(c.item_key) desc, c.manual_rank, c.updated_at desc nulls last limit 1)
    ) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from orders_keyed o
  order by o.updated_at desc nulls last, o.order_id;
$function$;

create or replace function public.web_get_shipment_table()
 returns table(section_name text, row_ref text, item text, material text, week text, qty numeric, bg text, can_send_to_work boolean, in_work boolean, sheets_needed numeric, available_sheets numeric, material_enough_for_order boolean, source_row_id text, source_col_id text, note text)
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with stock_norm as materialized (
    select
      ms1.qty_sheets,
      ms1.size_label,
      ms1.updated_at,
      lower(trim(coalesce(ms1.material, ''))) as mat_lower,
      public.web_normalize_material_name(ms1.material) as mat_key
    from public.materials_stock ms1
  ),
  cells as materialized (
    select
      spc.*,
      coalesce(nullif(spc.material, ''), icm.color_name, '') as mat_resolved,
      public.web_normalize_material_name(coalesce(nullif(spc.material, ''), icm.color_name, '')) as mat_key,
      lower(trim(coalesce(nullif(spc.material, ''), icm.color_name, ''))) as mat_lower
    from public.shipment_plan_cells spc
    left join public.item_color_map icm
      on lower(trim(icm.item_name)) = lower(trim(spc.item))
    where coalesce(spc.qty, 0) > 0
  ),
  src as (
    select
      coalesce(c.section_name, 'Прочее') as section_name,
      coalesce(c.row_ref, c.id::text) as row_ref,
      c.item,
      c.mat_resolved as material,
      c.week,
      c.qty,
      coalesce(c.bg, '#ffffff') as bg,
      c.can_send_to_work,
      c.in_work,
      coalesce(c.sheets_needed, 0) as sheets_needed_raw,
      coalesce(c.available_sheets, 0) as available_sheets_raw,
      c.source_row_id,
      c.source_col_id,
      c.note,
      ms.qty_sheets as stock_qty,
      fsc.output_per_sheet as capacity_output_per_sheet,
      c.updated_at,
      c.id as plan_id
    from cells c
    left join lateral (
      select s.qty_sheets, s.size_label
      from stock_norm s
      where s.mat_key = c.mat_key
      order by
        case when s.mat_lower = c.mat_lower then 0 else 1 end,
        coalesce(s.qty_sheets, 0) desc,
        s.updated_at desc nulls last
      limit 1
    ) ms on true
    left join public.furniture_sheet_capacity fsc
      on lower(trim(fsc.furniture_model)) = lower(trim(public.web_normalize_furniture_model(c.section_name)))
     and fsc.sheet_size = ms.size_label
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
$function$;

drop function if exists public.web_get_orders_shipped_v2();
drop function if exists public.web_get_warehouse_kit_orders_v2();
drop function if exists public.web_get_shipment_table_v2();
