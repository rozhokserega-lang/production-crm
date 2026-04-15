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
  v_norm_key text := lower(trim(regexp_replace(replace(trim(coalesce(p_material, '')), 'ё', 'е'), '\s+', ' ', 'g')));
  v_updated integer := 0;
begin
  if v_material = '' then
    raise exception 'Material is required';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  insert into public.materials_moves(material, qty_sheets, move_type, source_type, source_ref, comment)
  values (v_material, p_qty, 'expense', 'order', p_order_id, 'consume after pilka done')
  returning * into v_move;

  -- First try to update existing row by the same normalized key as ux_materials_stock_norm.
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
