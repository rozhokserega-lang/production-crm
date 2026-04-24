-- Prevent double counting leftovers after sync cycles.
-- Rule: operational leftovers dashboard/export should aggregate only
-- real order leftovers (SP-*/PL-* etc.), excluding technical sync rows
-- created by sync-materials-stock as order_id = 'sync-leftovers:*'.

create or replace function public.web_get_leftovers()
returns table(
  order_id text,
  item text,
  material text,
  sheets_needed numeric,
  leftover_format text,
  leftovers_qty numeric,
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  with agg as (
    select
      lower(trim(regexp_replace(replace(coalesce(ml.material, ''), 'ё', 'е'), '\s+', ' ', 'g'))) as material_norm,
      lower(trim(regexp_replace(coalesce(ml.leftover_format, ''), '\s+', ' ', 'g'))) as format_norm,
      max(ml.material) filter (where coalesce(ml.material, '') <> '') as material_any,
      max(ml.leftover_format) filter (where coalesce(ml.leftover_format, '') <> '') as format_any,
      sum(coalesce(ml.leftovers_qty, 0))::numeric as leftovers_qty_sum,
      max(ml.created_at) as last_created_at
    from public.materials_leftovers ml
    where coalesce(ml.order_id, '') not like 'sync-leftovers:%'
    group by 1, 2
  )
  select
    null::text as order_id,
    null::text as item,
    coalesce(agg.material_any, agg.material_norm) as material,
    null::numeric as sheets_needed,
    coalesce(agg.format_any, agg.format_norm) as leftover_format,
    agg.leftovers_qty_sum as leftovers_qty,
    agg.last_created_at as created_at
  from agg
  where coalesce(agg.material_norm, '') <> ''
    and coalesce(agg.format_norm, '') <> ''
    and coalesce(agg.leftovers_qty_sum, 0) <> 0
  order by material, leftover_format;
$function$;
