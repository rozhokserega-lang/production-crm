-- Shipment format rules in DB (not Google Script):
-- Donini 806 / 750 (+ white variants): big format -> 6 sets per sheet, small format -> 4 sets per sheet.

alter table if exists public.shipment_plan_cells
  add column if not exists output_per_sheet numeric(12,2) not null default 0;
alter table if exists public.shipment_plan_cells
  add column if not exists format_type text;
alter table if exists public.shipment_cells
  add column if not exists format_type text;

create table if not exists public.material_size_map (
  material_name text primary key,
  sheet_size text not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

insert into public.material_size_map(material_name, sheet_size, source) values
  ('белый', '2800x2070', 'materials.json'),
  ('бетон', '2750x1830', 'materials.json'),
  ('бетон чикаго', '2800x2070', 'materials.json'),
  ('бетон чикаго 25', '2800x2070', 'materials.json'),
  ('выбеленное дерево', '2750x1830', 'materials.json'),
  ('герион', '2750x1830', 'materials.json'),
  ('дуб вотан', '2800x2070', 'materials.json'),
  ('дуб вотан 25', '2800x2070', 'materials.json'),
  ('дуб галифакс олово', '2800x2070', 'materials.json'),
  ('дуб делано', '2750x1830', 'materials.json'),
  ('дуб кальяри', '2750x1830', 'materials.json'),
  ('дуб коми', '2750x1830', 'materials.json'),
  ('дуб марсала', '2800x2070', 'materials.json'),
  ('дуб хантон', '2800x2070', 'materials.json'),
  ('дуб хантон 25', '2800x2070', 'materials.json'),
  ('дуб чарльзтон', '2800x2070', 'materials.json'),
  ('интра', '2750x1830', 'materials.json'),
  ('камень пьетра гриджиа', '2800x2070', 'materials.json'),
  ('кейптаун', '2750x1830', 'materials.json'),
  ('маренго', '2750x1830', 'materials.json'),
  ('мрамор кристалл', '2800x2070', 'materials.json'),
  ('муза', '2750x1830', 'materials.json'),
  ('сланец скиваро', '2800x2070', 'materials.json'),
  ('сланец скиваро 25', '2800x2070', 'materials.json'),
  ('слоновая кость', '2750x1830', 'materials.json'),
  ('слэйт', '2750x1830', 'materials.json'),
  ('солнечный', '2750x1830', 'materials.json'),
  ('сонома / бардолино', '2800x2070', 'materials.json'),
  ('сонома / бардолино темная', '2800x2070', 'materials.json'),
  ('сосна касцина', '2800x2070', 'materials.json'),
  ('темное небо', '2750x1830', 'materials.json'),
  ('трансильвания', '2750x1830', 'materials.json'),
  ('цемент', '2750x1830', 'materials.json'),
  ('черный', '2800x2070', 'materials.json'),
  ('чили', '2750x1830', 'materials.json'),
  ('юта', '2750x1830', 'materials.json'),
  ('ясень анкор', '2750x1830', 'materials.json'),
  ('ясень тронхейм', '2800x2070', 'materials.json'),
  -- Aliases used in CRM material labels.
  ('бетон чикаго светло-серый', '2800x2070', 'materials.json:alias'),
  ('дуб чарльстон тёмно-коричневый', '2800x2070', 'materials.json:alias'),
  ('камень пьетра гриджиа чёрный', '2800x2070', 'materials.json:alias'),
  ('мрамор кристал', '2800x2070', 'materials.json:alias'),
  ('дуб бардолино натуральный', '2800x2070', 'materials.json:alias'),
  ('дуб канзас 25', '2800x2070', 'materials.json:alias'),
  ('ясень тронхейм 25', '2800x2070', 'materials.json:alias'),
  ('бардолино', '2800x2070', 'materials.json:alias'),
  ('белые ноги', '2800x2070', 'materials.json:alias')
on conflict (material_name) do update
set sheet_size = excluded.sheet_size,
    source = excluded.source,
    updated_at = now();

create or replace function public.web_resolve_output_per_sheet(
  p_section_name text,
  p_item text,
  p_material text,
  p_format_type text default null,
  p_fallback numeric default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_section text := lower(trim(coalesce(p_section_name, '')));
  v_item text := lower(trim(coalesce(p_item, '')));
  v_material text := lower(trim(coalesce(p_material, '')));
  v_format_type text := lower(trim(coalesce(p_format_type, '')));
  v_material_dims text := regexp_replace(v_material, '[\s*хx×]', '', 'g');
  v_mapped_sheet_size text := '';
  v_mapped_dims text := '';
  v_fallback numeric := coalesce(p_fallback, 0);
  v_is_donini_target boolean := false;
  v_is_cremona boolean := false;
  v_is_solito2 boolean := false;
  v_is_solito1150 boolean := false;
  v_is_solito1350 boolean := false;
  v_is_stabile boolean := false;
  v_is_donini_grande boolean := false;
  v_is_klassiko boolean := false;
  v_is_premier boolean := false;
  v_is_donini_r boolean := false;
begin
  v_is_cremona := v_section = 'cremona' or v_item like '%cremona%';
  v_is_solito2 := v_section = 'solito2' or v_item like '%solito2%';
  v_is_solito1150 := v_section in ('solito 1150', 'solito 1150 белый')
    or v_item like '%серия 1150%';
  v_is_solito1350 := v_section in ('solito 1350 черный', 'solito 1350 белый')
    or v_item like '%серия 1350%';
  v_is_stabile := v_section = 'stabile' or v_item like '%stabile%';
  v_is_donini_grande := v_section in ('donini grande 750', 'donini grande 806')
    or v_item like '%donini grande 750%'
    or v_item like '%donini grande 806%';
  v_is_klassiko := v_section in ('классико', 'классико +')
    or v_item like '%классико%';
  v_is_premier := v_section in ('премьер', 'премьер белый', 'премьер черный')
    or v_item like '%премьер%';
  v_is_donini_r := v_section in ('donini r 750', 'donini r 806')
    or v_item like '%donini r 750%'
    or v_item like '%donini r 806%';
  v_is_donini_target :=
    v_section = 'avella'
    or v_item like '%avella%'
    or v_is_cremona
    or v_is_solito2
    or v_is_solito1150
    or v_is_solito1350
    or v_is_stabile
    or v_is_donini_grande
    or v_is_klassiko
    or v_is_premier
    or v_is_donini_r
    or
    v_section in ('donini 806', 'donini 750', 'donini 806 белый', 'donini 750 белый')
    or v_item like '%donini 806%'
    or v_item like '%donini 750%';

  if not v_is_donini_target then
    return v_fallback;
  end if;

  if v_is_solito1350 then
    return 4;
  end if;
  if v_is_premier then
    return 5;
  end if;
  if v_is_klassiko then
    return 6;
  end if;
  if v_is_donini_grande then
    return 3;
  end if;
  if v_is_donini_r then
    return 4;
  end if;
  if v_is_solito2 then
    return 6;
  end if;
  if v_is_solito1150 then
    return 6;
  end if;

  if v_format_type in ('small', 'малый') then
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  if v_format_type in ('large', 'большой') then
    return case when v_is_cremona then 2 else 6 end;
  end if;

  -- Primary source: explicit material->sheet-size mapping.
  select lower(trim(coalesce(msm.sheet_size, '')))
    into v_mapped_sheet_size
  from public.material_size_map msm
  where public.normalize_item_key(msm.material_name) = public.normalize_item_key(v_material)
  order by msm.updated_at desc
  limit 1;

  v_mapped_dims := regexp_replace(coalesce(v_mapped_sheet_size, ''), '[\s*хx×]', '', 'g');
  if v_is_stabile then
    if v_mapped_dims = '28002070' then
      return 4;
    end if;
    if v_mapped_dims = '27501830' then
      return 3;
    end if;
  end if;
  if v_mapped_dims = '28002070' then
    return case when v_is_cremona then 2 else 6 end;
  end if;
  if v_mapped_dims = '27501830' then
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  -- Fallback only if size is already encoded in material text itself.
  if v_material_dims like '%28002070%' then
    if v_is_stabile then
      return 4;
    end if;
    return case when v_is_cremona then 2 else 6 end;
  end if;

  if v_material_dims like '%27501830%' then
    if v_is_stabile then
      return 3;
    end if;
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  -- No guessing for Donini rules: unknown size => unresolved output.
  return 0;
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
  v_format_type text := lower(trim(coalesce(p_format_type, '')));
  v_row_key text;
  v_col_key text;
  v_col_num text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_cell public.shipment_cells;
begin
  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  if v_format_type not in ('', 'large', 'small') then
    raise exception 'format_type must be large or small';
  end if;

  v_row_key := 'manual:' || substr(md5(lower(v_section || '|' || v_item || '|' || coalesce(v_material, ''))), 1, 16);
  v_col_num := nullif(regexp_replace(v_week, '\D', '', 'g'), '');
  v_col_key := coalesce(v_col_num, '0');

  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, nullif(v_format_type, ''), 0);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  insert into public.shipment_plan_cells (
    section_name, item, material, week, qty, format_type,
    row_ref, col_ref, source_row_id, source_col_id,
    bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_section, v_item, v_material, v_week, v_qty, nullif(v_format_type, ''),
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
    format_type = excluded.format_type,
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

create or replace function public.web_sync_plan_cell_to_shipment_cells()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
begin
  if tg_op = 'DELETE' then
    delete from public.shipment_cells
    where source_row_id = old.source_row_id
      and source_col_id = old.source_col_id;
    return old;
  end if;

  v_output_per_sheet := public.web_resolve_output_per_sheet(
    new.section_name,
    new.item,
    new.material,
    new.format_type,
    coalesce(new.output_per_sheet, 0)
  );

  v_sheets_needed := case
    when coalesce(new.sheets_needed, 0) > 0 then coalesce(new.sheets_needed, 0)
    when v_output_per_sheet > 0 and coalesce(new.qty, 0) > 0 then ceil(new.qty / v_output_per_sheet)
    else 0
  end;

  insert into public.shipment_cells (
    source_row_id, source_col_id, section_name, item, material, week, qty, format_type,
    bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    new.source_row_id, new.source_col_id, new.section_name, new.item, new.material, new.week, new.qty, new.format_type,
    coalesce(new.bg, '#ffffff'), coalesce(new.can_send_to_work, true), coalesce(new.in_work, false),
    v_sheets_needed, coalesce(new.available_sheets, 0), v_output_per_sheet,
    coalesce(new.note, '')
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    format_type = excluded.format_type,
    bg_color = excluded.bg_color,
    can_send_to_work = excluded.can_send_to_work,
    in_work = excluded.in_work,
    sheets_needed = excluded.sheets_needed,
    available_sheets = excluded.available_sheets,
    output_per_sheet = excluded.output_per_sheet,
    note = excluded.note,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.web_get_shipment_board()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with cells as (
    select
      coalesce(nullif(section_name, ''), 'Прочее') as section_name,
      coalesce(nullif(item, ''), 'Без названия') as item,
      coalesce(nullif(material, ''), '') as material,
      coalesce(source_row_id, '0') as source_row_id,
      coalesce(source_col_id, '0') as source_col_id,
      case
        when length(regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')) between 1 and 9
          then regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')::int
        else null
      end as source_col_num,
      (mod(abs(hashtextextended(coalesce(source_row_id, '0'), 0)), 1000000000))::int as source_row_num,
      coalesce(week, '') as week,
      coalesce(qty, 0) as qty,
      lower(trim(coalesce(format_type, ''))) as format_type,
      public.web_resolve_output_per_sheet(section_name, item, material, lower(trim(coalesce(format_type, ''))), coalesce(output_per_sheet, 0)) as output_per_sheet,
      case
        when coalesce(sheets_needed, 0) > 0 then coalesce(sheets_needed, 0)
        when public.web_resolve_output_per_sheet(section_name, item, material, lower(trim(coalesce(format_type, ''))), coalesce(output_per_sheet, 0)) > 0
          and coalesce(qty, 0) > 0
          then ceil(coalesce(qty, 0) / public.web_resolve_output_per_sheet(section_name, item, material, lower(trim(coalesce(format_type, ''))), coalesce(output_per_sheet, 0)))
        else 0
      end as sheets_needed,
      coalesce(available_sheets, 0) as available_sheets,
      (coalesce(sheets_needed, 0) <= coalesce(available_sheets, 0)) as material_enough_for_order,
      coalesce(bg, '#ffffff') as bg,
      coalesce(note, '') as note,
      coalesce(in_work, false) as in_work,
      coalesce(can_send_to_work, false) as can_send_to_work
    from public.shipment_plan_cells
    where coalesce(qty, 0) > 0
  ),
  grouped_items as (
    select
      section_name,
      item,
      material,
      format_type,
      source_row_id,
      coalesce(source_row_num, 0) as source_row_num,
      jsonb_agg(
        jsonb_build_object(
          'col', coalesce(source_col_num, 0),
          'sourceColId', source_col_id,
          'week', week,
          'qty', qty,
          'outputPerSheet', output_per_sheet,
          'sheetsNeeded', sheets_needed,
          'availableSheets', available_sheets,
          'materialEnoughForOrder', material_enough_for_order,
          'bg', bg,
          'note', note,
          'inWork', in_work,
          'canSendToWork', can_send_to_work
        )
        order by coalesce(source_col_num, 0)
      ) as cells
    from cells
    group by section_name, item, material, source_row_id, source_row_num
  ),
  grouped_sections as (
    select
      section_name as name,
      jsonb_agg(
        jsonb_build_object(
          'row', coalesce(source_row_num, 0),
          'sourceRowId', source_row_id,
          'item', item,
          'material', material,
          'formatType', nullif(format_type, ''),
          'cells', cells
        )
        order by item, coalesce(source_row_num, 0)
      ) as items
    from grouped_items
    group by section_name
  )
  select jsonb_build_object(
    'weeks', (
      select coalesce(
        jsonb_agg(jsonb_build_object('col', w.col, 'week', w.week) order by w.col),
        '[]'::jsonb
      )
      from (
        select distinct coalesce(source_col_num, 0) as col, week
        from cells
      ) w
    ),
    'sections',
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('name', name, 'items', items) order by name)
        from grouped_sections
      ),
      '[]'::jsonb
    )
  );
$$;

-- Recalculate existing manual plan rows with new rules.
update public.shipment_plan_cells sp
set
  output_per_sheet = public.web_resolve_output_per_sheet(sp.section_name, sp.item, sp.material, sp.format_type, coalesce(sp.output_per_sheet, 0)),
  sheets_needed = case
    when public.web_resolve_output_per_sheet(sp.section_name, sp.item, sp.material, sp.format_type, coalesce(sp.output_per_sheet, 0)) > 0
      and coalesce(sp.qty, 0) > 0
      then ceil(coalesce(sp.qty, 0) / public.web_resolve_output_per_sheet(sp.section_name, sp.item, sp.material, sp.format_type, coalesce(sp.output_per_sheet, 0)))
    else coalesce(sp.sheets_needed, 0)
  end
where lower(coalesce(sp.section_name, '')) in ('avella', 'cremona', 'solito2', 'solito 1150', 'solito 1150 белый', 'solito 1350 черный', 'solito 1350 белый', 'stabile', 'классико', 'классико +', 'премьер', 'премьер белый', 'премьер черный', 'donini grande 750', 'donini grande 806', 'donini 806', 'donini 750', 'donini 806 белый', 'donini 750 белый')
   or lower(coalesce(sp.item, '')) like '%avella%'
   or lower(coalesce(sp.item, '')) like '%cremona%'
   or lower(coalesce(sp.item, '')) like '%solito2%'
   or lower(coalesce(sp.item, '')) like '%серия 1150%'
   or lower(coalesce(sp.item, '')) like '%серия 1350%'
   or lower(coalesce(sp.item, '')) like '%stabile%'
   or lower(coalesce(sp.item, '')) like '%классико%'
   or lower(coalesce(sp.item, '')) like '%премьер%'
   or lower(coalesce(sp.item, '')) like '%donini grande 750%'
   or lower(coalesce(sp.item, '')) like '%donini grande 806%'
   or lower(coalesce(sp.item, '')) like '%donini 806%'
   or lower(coalesce(sp.item, '')) like '%donini 750%';

update public.shipment_cells sc
set
  output_per_sheet = public.web_resolve_output_per_sheet(sc.section_name, sc.item, sc.material, sc.format_type, coalesce(sc.output_per_sheet, 0)),
  sheets_needed = case
    when public.web_resolve_output_per_sheet(sc.section_name, sc.item, sc.material, sc.format_type, coalesce(sc.output_per_sheet, 0)) > 0
      and coalesce(sc.qty, 0) > 0
      then ceil(coalesce(sc.qty, 0) / public.web_resolve_output_per_sheet(sc.section_name, sc.item, sc.material, sc.format_type, coalesce(sc.output_per_sheet, 0)))
    else coalesce(sc.sheets_needed, 0)
  end
where lower(coalesce(sc.section_name, '')) in ('avella', 'cremona', 'solito2', 'solito 1150', 'solito 1150 белый', 'solito 1350 черный', 'solito 1350 белый', 'stabile', 'классико', 'классико +', 'премьер', 'премьер белый', 'премьер черный', 'donini grande 750', 'donini grande 806', 'donini 806', 'donini 750', 'donini 806 белый', 'donini 750 белый')
   or lower(coalesce(sc.item, '')) like '%avella%'
   or lower(coalesce(sc.item, '')) like '%cremona%'
   or lower(coalesce(sc.item, '')) like '%solito2%'
   or lower(coalesce(sc.item, '')) like '%серия 1150%'
   or lower(coalesce(sc.item, '')) like '%серия 1350%'
   or lower(coalesce(sc.item, '')) like '%stabile%'
   or lower(coalesce(sc.item, '')) like '%классико%'
   or lower(coalesce(sc.item, '')) like '%премьер%'
   or lower(coalesce(sc.item, '')) like '%donini grande 750%'
   or lower(coalesce(sc.item, '')) like '%donini grande 806%'
   or lower(coalesce(sc.item, '')) like '%donini 806%'
   or lower(coalesce(sc.item, '')) like '%donini 750%';

grant execute on function public.web_resolve_output_per_sheet(text, text, text, text, numeric) to authenticated, anon, service_role;
grant select on public.material_size_map to authenticated, anon, service_role;
