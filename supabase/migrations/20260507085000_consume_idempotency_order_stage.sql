-- Enforce idempotency for "consume after pilka done" on DB level:
-- only one expense consume move per order_id for this stage.

with ranked as (
  select
    id,
    row_number() over (
      partition by trim(coalesce(source_ref, ''))
      order by created_at asc, id asc
    ) as rn
  from public.materials_moves
  where move_type = 'expense'
    and source_type = 'order'
    and comment = 'consume after pilka done'
)
delete from public.materials_moves mm
using ranked r
where mm.id = r.id
  and r.rn > 1;

create unique index if not exists ux_materials_moves_consume_once_per_order
  on public.materials_moves ((trim(coalesce(source_ref, ''))))
  where move_type = 'expense'
    and source_type = 'order'
    and comment = 'consume after pilka done';

create or replace function public.web_consume_sheets_by_order_id(
  p_order_id text,
  p_material text,
  p_qty numeric
)
returns public.materials_moves
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_move public.materials_moves;
  v_material text := trim(coalesce(p_material, ''));
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_norm_key text := lower(trim(regexp_replace(replace(trim(coalesce(p_material, '')), 'ё', 'е'), '\s+', ' ', 'g')));
  v_updated integer := 0;
  v_stage_comment text := 'consume after pilka done';
begin
  if v_order_id = '' then
    raise exception 'Order ID is required';
  end if;
  if v_material = '' then
    raise exception 'Material is required';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  -- Hard idempotency guard by order + stage marker.
  select * into v_move
  from public.materials_moves mm
  where mm.move_type = 'expense'
    and mm.source_type = 'order'
    and trim(coalesce(mm.source_ref, '')) = v_order_id
    and mm.comment = v_stage_comment
  order by mm.created_at desc
  limit 1;
  if v_move.id is not null then
    return v_move;
  end if;

  insert into public.materials_moves(material, qty_sheets, move_type, source_type, source_ref, comment)
  values (v_material, p_qty, 'expense', 'order', v_order_id, v_stage_comment)
  returning * into v_move;

  update public.materials_stock ms
  set
    qty_sheets = coalesce(ms.qty_sheets, 0) - p_qty,
    updated_at = now()
  where lower(trim(regexp_replace(replace(trim(ms.material), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.materials_stock(material, qty_sheets)
    values (v_material, -p_qty)
    on conflict (material) do update
      set
        qty_sheets = coalesce(public.materials_stock.qty_sheets, 0) - p_qty,
        updated_at = now();
  end if;

  return v_move;
end;
$$;

grant execute on function public.web_consume_sheets_by_order_id(text, text, numeric) to anon, authenticated, service_role;
