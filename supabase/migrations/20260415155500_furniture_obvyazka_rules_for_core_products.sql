-- Expand furniture product aliases and bind all "обвязка" details
-- to article streams of requested core products.

insert into public.furniture_product_map (product_name, section_name, item_name_pattern, sort_order, is_active)
values
  ('Авелла', 'Avella', null, 49, true),
  ('Авелла Лайт', 'Avella lite', null, 50, true)
on conflict do nothing;

insert into public.furniture_detail_item_map (
  product_name,
  detail_name_pattern,
  item_name_exact,
  sort_order,
  is_active
)
values
  ('Донини', '%обвязка%', 'Планка обвязки 1 метр, Donini', 10, true),
  ('Донини R', '%обвязка%', 'Планка обвязки 1 метр, Donini', 20, true),
  ('Авела Лайт', '%обвязка%', 'Планка обвязки 1 метр, Donini', 30, true),
  ('Авелла Лайт', '%обвязка%', 'Планка обвязки 1 метр, Donini', 31, true),
  ('Авелла', '%обвязка%', 'Планка обвязки 1 метр, Donini', 40, true)
on conflict do nothing;
