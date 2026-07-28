-- Ancona: обвязка 522_100, 2 шт на 1 стол.

insert into public.section_catalog (section_name, sort_order, is_active)
values ('Ancona', 45, true)
on conflict (section_name) do update
  set is_active = excluded.is_active,
      sort_order = excluded.sort_order;

update public.item_article_map
set section_name = 'Ancona'
where coalesce(trim(section_name), '') = ''
  and lower(trim(item_name)) like '%ancona%'
  and lower(trim(item_name)) not like '%раздвиж%';

insert into public.furniture_product_map (product_name, section_name, item_name_pattern, sort_order, is_active)
values ('Ancona', 'Ancona', null, 45, true)
on conflict do nothing;

insert into public.furniture_detail_item_map (
  product_name,
  detail_name_pattern,
  item_name_exact,
  sort_order,
  is_active
)
values (
  'Ancona',
  '%обвязка%522_100%',
  'Обвязка (522_100)',
  10,
  true
)
on conflict (
  lower(trim(product_name)),
  lower(trim(detail_name_pattern)),
  lower(trim(item_name_exact))
)
do update set
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.furniture_custom_templates (product_name, details, kits_per_sheet, created_by)
select
  'Ancona',
  '[{"perUnit": 2, "detailName": "Обвязка (522_100)"}]'::jsonb,
  0,
  coalesce(
    (select id from auth.users where email = 'rozhokserega@gmail.com' limit 1),
    (select id from auth.users order by created_at limit 1)
  )
on conflict (product_name) do update
  set details = excluded.details,
      updated_at = now();
