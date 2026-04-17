-- Warehouse: consumption history (how many sheets spent and for which order).

create or replace function public.web_get_consume_history(
  p_limit integer default 300
)
returns table (
  move_id uuid,
  created_at timestamptz,
  order_id text,
  material text,
  qty_sheets numeric,
  comment text
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    mm.id as move_id,
    mm.created_at,
    trim(coalesce(mm.source_ref, '')) as order_id,
    trim(coalesce(mm.material, '')) as material,
    coalesce(mm.qty_sheets, 0) as qty_sheets,
    mm.comment
  from public.materials_moves mm
  where lower(coalesce(mm.move_type, '')) = 'expense'
    and lower(coalesce(mm.source_type, '')) = 'order'
  order by mm.created_at desc, mm.id desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
$$;

grant execute on function public.web_get_consume_history(integer) to anon, authenticated, service_role;
