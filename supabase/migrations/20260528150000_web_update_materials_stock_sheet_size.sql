-- Ручное изменение размера листа материала на складе (UI).

create or replace function public.web_update_materials_stock_sheet_size(
  p_material text,
  p_size_label text
)
returns table (
  material text,
  qty_sheets numeric,
  size_label text,
  sheet_width_mm integer,
  sheet_height_mm integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_material text := trim(coalesce(p_material, ''));
  v_norm_key text;
  v_size_label text := lower(trim(coalesce(p_size_label, '')));
  v_width integer;
  v_height integer;
  v_material_row text;
  v_match text[];
begin
  perform public.web_require_roles(array['warehouse', 'manager', 'admin']);

  if v_material = '' then
    raise exception 'Material is required';
  end if;

  v_norm_key := lower(trim(regexp_replace(replace(v_material, 'ё', 'е'), '\s+', ' ', 'g')));

  if v_size_label = '' or v_size_label = '-' then
    v_width := null;
    v_height := null;
    v_size_label := null;
  else
    v_match := regexp_match(replace(replace(v_size_label, '×', 'x'), ' ', ''), '^(\d+)x(\d+)$');
    if v_match is null then
      raise exception 'Invalid size format. Use 2800x2070';
    end if;
    v_width := v_match[1]::integer;
    v_height := v_match[2]::integer;
    if v_width <= 0 or v_height <= 0 then
      raise exception 'Invalid size format. Use 2800x2070';
    end if;
    v_size_label := v_width::text || 'x' || v_height::text;
  end if;

  select ms.material
  into v_material_row
  from public.materials_stock ms
  where lower(trim(regexp_replace(replace(trim(ms.material), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key
  limit 1;

  if v_material_row is null then
    raise exception 'Material not found in stock';
  end if;

  update public.materials_stock ms
  set
    size_label = v_size_label,
    sheet_width_mm = v_width,
    sheet_height_mm = v_height,
    updated_at = now()
  where lower(trim(regexp_replace(replace(trim(ms.material), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key;

  if v_size_label is not null then
    insert into public.material_size_map(material_name, sheet_size, source, updated_at)
    values (v_material_row, v_size_label, 'warehouse:ui', now())
    on conflict (material_name) do update
      set
        sheet_size = excluded.sheet_size,
        source = excluded.source,
        updated_at = now();
  else
    delete from public.material_size_map msm
    where lower(trim(regexp_replace(replace(trim(msm.material_name), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key;
  end if;

  return query
  select
    ms.material,
    coalesce(ms.qty_sheets, 0)::numeric as qty_sheets,
    ms.size_label,
    ms.sheet_width_mm,
    ms.sheet_height_mm,
    ms.updated_at
  from public.materials_stock ms
  where lower(trim(regexp_replace(replace(trim(ms.material), 'ё', 'е'), '\s+', ' ', 'g'))) = v_norm_key;
end;
$$;

grant execute on function public.web_update_materials_stock_sheet_size(text, text)
  to anon, authenticated, service_role;
