-- Stage 2 (P0): role helpers + guards for critical RPCs.
-- Compatibility mode: unauthenticated calls are treated as admin for now
-- to avoid breaking existing anon-key flow. Tighten this after auth rollout.

create or replace function public.web_is_valid_crm_role(p_role text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(trim(p_role), '')) in ('admin', 'manager', 'operator', 'viewer')
$$;

create or replace function public.web_effective_crm_role()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
  v_claim_role text := lower(trim(coalesce(v_claims -> 'app_metadata' ->> 'crm_role', v_claims ->> 'crm_role', '')));
begin
  if v_db_role = 'service_role' then
    return 'admin';
  end if;
  if public.web_is_valid_crm_role(v_claim_role) then
    return v_claim_role;
  end if;

  -- Backward-compatible fallback for current frontend flow (no user auth yet).
  if auth.uid() is null then
    return 'admin';
  end if;
  return 'viewer';
end;
$$;

create or replace function public.web_require_roles(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_effective text := public.web_effective_crm_role();
begin
  if p_roles is null or array_length(p_roles, 1) is null then
    return;
  end if;
  if v_effective = any (
    array(
      select lower(trim(x))
      from unnest(p_roles) x
      where x is not null and trim(x) <> ''
    )
  ) then
    return;
  end if;
  raise exception using
    errcode = '42501',
    message = format('Недостаточно прав: требуется одна из ролей [%s], текущая роль [%s]', array_to_string(p_roles, ', '), v_effective);
end;
$$;

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
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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
  perform public.web_require_roles(array['manager', 'admin']);

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

  return query select v_deleted_orders, v_deleted_labor, v_deleted_leftovers, v_deleted_plank;
end;
$$;

create or replace function public.web_send_planks_to_work(p_items jsonb)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_now timestamptz := now();
  v_batch text := 'OBV-' || to_char(v_now, 'YYMMDD-HH24MISS');
  v_order_id text := 'PL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_week text := to_char(v_now, 'IYYY-IW');
  v_total_qty numeric := 0;
  v_total_sheets numeric := 0;
  v_batch_id uuid;
  v_line int := 0;
  x jsonb;
  v_name text;
  v_qty numeric;
  v_len int;
  v_wid int;
  v_per_sheet int;
  v_sheets int;
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items array required';
  end if;

  insert into public.plank_batches (batch_code, display_name, material, status, week)
  values (v_batch, 'Планки обвязки', 'Черный', 'sent_to_work', v_week)
  returning id into v_batch_id;

  for x in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(both from coalesce(x->>'name',''));
    v_qty := coalesce((x->>'qty')::numeric, 0);
    if v_name = '' or v_qty <= 0 then
      continue;
    end if;
    v_line := v_line + 1;
    v_len := null;
    v_wid := null;
    v_per_sheet := 0;
    v_sheets := 0;

    if v_name ~ '\((\d+)_(\d+)\)' then
      v_len := substring(v_name from '\((\d+)_(\d+)\)')::int;
      v_wid := substring(v_name from '\(\d+_(\d+)\)')::int;
      v_per_sheet := public.calc_per_sheet(v_len, v_wid);
      if v_per_sheet > 0 then
        v_sheets := ceil(v_qty / v_per_sheet)::int;
      end if;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total_sheets := v_total_sheets + v_sheets;

    insert into public.plank_batch_items (
      batch_id, line_no, name, qty, length_mm, width_mm, per_sheet, sheets_needed
    )
    values (
      v_batch_id, v_line, v_name, v_qty, v_len, v_wid, v_per_sheet, v_sheets
    );
  end loop;

  update public.plank_batches
    set total_qty = v_total_qty, total_sheets = v_total_sheets
    where id = v_batch_id;

  insert into public.orders (
    order_id, source, item, material, week, qty,
    pilka_status, kromka_status, pras_status, assembly_status, overall_status,
    notes
  )
  values (
    v_order_id, 'supabase', 'Планки обвязки [' || v_batch || ']', 'Черный', v_week, v_total_qty,
    '⏳ Ожидает', '⏳ Ожидает', '⏳ Ожидает', '⏳ Ожидает', '🟡 Новый заказ',
    'batch_id=' || v_batch_id::text
  )
  returning * into v_row;

  update public.plank_batches set order_id = v_order_id where id = v_batch_id;
  return v_row;
end;
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
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

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

  v_row_key := coalesce(nullif(trim(v_existing_row_key), ''), 'manual:' || substr(md5(lower(v_section || '|' || v_item || '|' || coalesce(v_material, ''))), 1, 16));
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

  select * into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;

create or replace function public.web_delete_shipment_plan_cell_by_source(
  p_row text,
  p_col text
)
returns table (
  deleted_plan integer,
  deleted_shipment integer
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_deleted_plan integer := 0;
  v_deleted_shipment integer := 0;
  v_in_work boolean := false;
begin
  perform public.web_require_roles(array['manager', 'admin']);

  if coalesce(trim(p_row), '') = '' or coalesce(trim(p_col), '') = '' then
    raise exception 'Row/col are required';
  end if;

  select coalesce(sc.in_work, false)
    into v_in_work
  from public.shipment_cells sc
  where sc.source_row_id = trim(p_row)
    and sc.source_col_id = trim(p_col)
  limit 1;

  if v_in_work then
    raise exception 'Нельзя удалить: позиция уже отправлена в работу';
  end if;

  delete from public.shipment_plan_cells sp
  where sp.source_row_id = trim(p_row)
    and sp.source_col_id = trim(p_col);
  get diagnostics v_deleted_plan = row_count;

  delete from public.shipment_cells sc
  where sc.source_row_id = trim(p_row)
    and sc.source_col_id = trim(p_col)
    and coalesce(sc.in_work, false) = false;
  get diagnostics v_deleted_shipment = row_count;

  if v_deleted_plan = 0 and v_deleted_shipment = 0 then
    raise exception 'Shipment cell not found: row %, col %', p_row, p_col;
  end if;

  return query select v_deleted_plan, v_deleted_shipment;
end;
$$;

create or replace function public.web_upsert_item_color_map(
  p_item_name text,
  p_color_name text
)
returns table (
  out_item_name text,
  out_color_name text,
  out_source text,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['manager', 'admin']);

  insert into public.item_color_map(item_name, color_name, source)
  values (trim(p_item_name), trim(p_color_name), 'manual')
  on conflict (item_name)
  do update set
    color_name = excluded.color_name,
    source = 'manual',
    updated_at = now();

  return query
  select m.item_name, m.color_name, m.source, m.updated_at
  from public.item_color_map m
  where m.item_name = trim(p_item_name);
end;
$$;

grant execute on function public.web_is_valid_crm_role(text) to anon, authenticated, service_role;
grant execute on function public.web_effective_crm_role() to anon, authenticated, service_role;
grant execute on function public.web_require_roles(text[]) to anon, authenticated, service_role;
grant execute on function public.web_send_shipment_to_work_by_source(text, text) to anon, authenticated, service_role;
grant execute on function public.web_consume_sheets_by_order_id(text, text, numeric) to anon, authenticated, service_role;
grant execute on function public.web_delete_order_by_id(text) to anon, authenticated, service_role;
grant execute on function public.web_send_planks_to_work(jsonb) to anon, authenticated, service_role;
grant execute on function public.web_create_shipment_plan_cell(text, text, text, text, numeric, text) to anon, authenticated, service_role;
grant execute on function public.web_delete_shipment_plan_cell_by_source(text, text) to anon, authenticated, service_role;
grant execute on function public.web_upsert_item_color_map(text, text) to anon, authenticated, service_role;
