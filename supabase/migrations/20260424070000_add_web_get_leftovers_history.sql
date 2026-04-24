-- Warehouse: leftovers history with source order visibility.

create or replace function public.web_get_leftovers_history(
  p_limit integer default 500
)
returns table (
  id uuid,
  created_at timestamptz,
  order_id text,
  item text,
  material text,
  leftover_format text,
  leftovers_qty numeric
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    ml.id,
    ml.created_at,
    trim(coalesce(ml.order_id, '')) as order_id,
    trim(coalesce(ml.item, '')) as item,
    trim(coalesce(ml.material, '')) as material,
    trim(coalesce(ml.leftover_format, '')) as leftover_format,
    coalesce(ml.leftovers_qty, 0) as leftovers_qty
  from public.materials_leftovers ml
  where coalesce(ml.leftovers_qty, 0) <> 0
  order by ml.created_at desc, ml.id desc
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;

grant execute on function public.web_get_leftovers_history(integer) to anon, authenticated, service_role;
