-- Allow several sheet consume moves per order (one per material).

drop index if exists public.ux_materials_moves_consume_once_per_order;

create unique index if not exists ux_materials_moves_consume_once_per_order_material
  on public.materials_moves (
    trim(coalesce(source_ref, '')),
    lower(trim(regexp_replace(replace(trim(material), 'ё', 'е'), '\s+', ' ', 'g')))
  )
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

  select * into v_move
  from public.materials_moves mm
  where mm.move_type = 'expense'
    and mm.source_type = 'order'
    and trim(coalesce(mm.source_ref, '')) = v_order_id
    and mm.comment = v_stage_comment
    and lower(trim(regexp_replace(replace(trim(mm.material), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key
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

create or replace function public.web_consume_sheets_lines_by_order_id(
  p_order_id text,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_row jsonb;
  v_material text;
  v_qty numeric;
  v_move public.materials_moves;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_order_id = '' then
    raise exception 'Order ID is required';
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be a json array';
  end if;

  for v_row in select value from jsonb_array_elements(v_lines)
  loop
    v_material := trim(coalesce(v_row->>'material', ''));
    v_qty := coalesce((v_row->>'qty')::numeric, (v_row->>'qty_sheets')::numeric, 0);
    if v_material = '' or v_qty <= 0 then
      continue;
    end if;
    v_move := public.web_consume_sheets_by_order_id(v_order_id, v_material, v_qty);
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('material', v_material, 'qty', v_qty, 'move_id', v_move.id)
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no valid consume lines (need material+qty)';
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'lines_consumed', v_count, 'results', v_results);
end;
$$;

grant execute on function public.web_consume_sheets_lines_by_order_id(text, jsonb) to anon, authenticated, service_role;
