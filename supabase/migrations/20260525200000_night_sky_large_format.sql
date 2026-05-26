-- «ночное небо» — большой формат листа (2800×2070)

insert into public.material_size_map (material_name, sheet_size, source)
values ('ночное небо', '2800x2070', 'manual:warehouse')
on conflict (material_name) do update
set
  sheet_size = excluded.sheet_size,
  source = excluded.source;

update public.materials_stock
set
  size_label = '2800x2070',
  sheet_width_mm = 2800,
  sheet_height_mm = 2070,
  updated_at = now()
where material = 'ночное небо';
