-- ТВ Лофт 1500: добавить «Тумба под ТВ Лофт 150. Дуб Коми» (GXtvsLoftGOk).

insert into public.item_article_map (
  article,
  item_name,
  source,
  section_name,
  table_color,
  sort_order
)
values (
  'GXtvsLoftGOk',
  'Тумба под ТВ Лофт 150. Дуб Коми',
  'manual',
  'ТВ Лофт 1500',
  'Дуб коми',
  55
)
on conflict (article) do update
set item_name = excluded.item_name,
    section_name = excluded.section_name,
    table_color = excluded.table_color,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.item_color_map (item_name, color_name, source)
values ('Тумба под ТВ Лофт 150. Дуб Коми', 'Дуб коми', 'manual')
on conflict (item_name) do update
set color_name = excluded.color_name,
    updated_at = now();

insert into public.furniture_metal_map (
  furniture_article,
  metal_article,
  metal_name,
  qty_per_unit,
  is_active
)
values (
  'GXtvsLoftGOk',
  'GXtvsbLoftB150',
  'Ноги для тумбы под ТВ Лофт 150',
  1,
  true
)
on conflict (furniture_article, metal_article) do update
set metal_name = excluded.metal_name,
    qty_per_unit = excluded.qty_per_unit,
    is_active = excluded.is_active,
    updated_at = now();
