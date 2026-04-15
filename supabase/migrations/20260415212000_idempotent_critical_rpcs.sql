create or replace function public.web_send_shipment_to_work_by_source(
  p_row text,
  p_col text
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  c public.shipment_cells%rowtype;
  p public.shipment_plan_cells%rowtype;
  v_order_id text;
  v_row public.orders;
begin
  select * into c
  from public.shipment_cells
  where source_row_id = p_row and source_col_id = p_col
  for update;

  if c.id is null then
    select * into p
    from public.shipment_plan_cells
    where source_row_id = p_row and source_col_id = p_col
    limit 1;

    if p.id is null then
      raise exception 'Shipment cell not found: row %, col %', p_row, p_col;
    end if;

    insert into public.shipment_cells (
      source_row_id, source_col_id, section_name, item, material, week, qty,
      bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      p.source_row_id, p.source_col_id, p.section_name, p.item, p.material, p.week, p.qty,
      coalesce(p.bg, '#ffffff'), true, false,
      coalesce(p.sheets_needed, 0), coalesce(p.available_sheets, 0), 0,
      coalesce(nullif(p.note, ''), 'copied from shipment_plan_cells')
    )
    on conflict (source_row_id, source_col_id)
    do update set
      section_name = excluded.section_name,
      item = excluded.item,
      material = excluded.material,
      week = excluded.week,
      qty = excluded.qty,
      bg_color = excluded.bg_color,
      can_send_to_work = true,
      in_work = false,
      sheets_needed = excluded.sheets_needed,
      available_sheets = excluded.available_sheets,
      output_per_sheet = excluded.output_per_sheet,
      note = excluded.note,
      updated_at = now();

    select * into c
    from public.shipment_cells
    where source_row_id = p_row and source_col_id = p_col
    for update;
  end if;

  if coalesce(c.qty, 0) <= 0 then
    raise exception 'Qty is empty';
  end if;

  -- Idempotency: repeated calls should return existing active order instead of failing/duplicating.
  select * into v_row
  from public.orders o
  where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, ''))
    and coalesce(o.shipped, false) = false
  order by o.created_at desc
  limit 1;

  if v_row.id is not null then
    update public.shipment_cells
      set in_work = true, can_send_to_work = false, bg_color = '#ffff00', updated_at = now()
      where id = c.id;

    update public.shipment_plan_cells
      set in_work = true, can_send_to_work = false, bg = '#ffff00', updated_at = now()
      where source_row_id = p_row and source_col_id = p_col;

    return v_row;
  end if;

  if c.in_work then
    raise exception 'Cell is already in work';
  end if;

  v_order_id := 'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (
    order_id, source, source_row_id, item, material, week, qty,
    pilka_status, kromka_status, pras_status, assembly_status, overall_status
  )
  values (
    v_order_id, 'supabase', c.source_row_id, c.item, c.material, c.week, c.qty,
    '⏳ Ожидает пилу', '⏳ Ожидает', '⏳ Ожидает', '⏳ Ожидает', '🟡 Отправлен на пилу'
  )
  returning * into v_row;

  update public.shipment_cells
    set in_work = true, can_send_to_work = false, bg_color = '#ffff00', updated_at = now()
    where id = c.id;

  update public.shipment_plan_cells
    set in_work = true, can_send_to_work = false, bg = '#ffff00', updated_at = now()
    where source_row_id = p_row and source_col_id = p_col;

  return v_row;
end;
$$;

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

  -- Idempotency: if identical consume move already exists for this order+material+qty, reuse it.
  select * into v_move
  from public.materials_moves mm
  where mm.move_type = 'expense'
    and mm.source_type = 'order'
    and trim(coalesce(mm.source_ref, '')) = trim(coalesce(p_order_id, ''))
    and lower(trim(regexp_replace(replace(trim(coalesce(mm.material, '')), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key
    and coalesce(mm.qty_sheets, 0) = p_qty
  order by mm.created_at desc
  limit 1;
  if v_move.id is not null then
    return v_move;
  end if;

  insert into public.materials_moves(material, qty_sheets, move_type, source_type, source_ref, comment)
  values (v_material, p_qty, 'expense', 'order', p_order_id, 'consume after pilka done')
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

create or replace function public.web_delete_order_by_id(
  p_order_id text
)
returns table (
  deleted_orders integer,
  deleted_labor_facts integer,
  deleted_leftovers integer,
  deleted_plank_batches integer
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_deleted_orders integer := 0;
  v_deleted_labor integer := 0;
  v_deleted_leftovers integer := 0;
  v_deleted_plank integer := 0;
begin
  if v_order_id = '' then
    raise exception 'order_id is required';
  end if;

  delete from public.shipment_plan_cells sp
  where trim(coalesce(sp.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.shipment_cells sc
  where trim(coalesce(sc.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.labor_facts where order_id = v_order_id;
  get diagnostics v_deleted_labor = row_count;

  delete from public.materials_leftovers where order_id = v_order_id;
  get diagnostics v_deleted_leftovers = row_count;

  delete from public.plank_batches where order_id = v_order_id;
  get diagnostics v_deleted_plank = row_count;

  delete from public.orders where order_id = v_order_id;
  get diagnostics v_deleted_orders = row_count;

  -- Idempotency: repeated delete must not fail.
  return query select v_deleted_orders, v_deleted_labor, v_deleted_leftovers, v_deleted_plank;
end;
$$;

grant execute on function public.web_send_shipment_to_work_by_source(text, text) to anon, authenticated, service_role;
grant execute on function public.web_consume_sheets_by_order_id(text, text, numeric) to anon, authenticated, service_role;
grant execute on function public.web_delete_order_by_id(text) to anon, authenticated, service_role;
