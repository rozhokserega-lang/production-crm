-- Remove duplicate Avella Lite alias and tighten Donini strap patterns.

update public.furniture_detail_item_map
set is_active = false
where lower(trim(product_name)) = lower('Авела Лайт')
  and lower(trim(detail_name_pattern)) = lower('%обвязка%')
  and lower(trim(item_name_exact)) = lower('Планка обвязки 1 метр, Donini');

update public.furniture_detail_item_map
set detail_name_pattern = '%обвязка%1000_80%',
    sort_order = 10
where is_active = true
  and lower(trim(product_name)) = lower('Донини')
  and lower(trim(detail_name_pattern)) = lower('%обвязка%')
  and lower(trim(item_name_exact)) = lower('Планка обвязки 1 метр, Donini');

insert into public.furniture_detail_item_map (
  product_name,
  detail_name_pattern,
  item_name_exact,
  sort_order,
  is_active
)
values
  ('Донини', '%обвязка%558_80%', 'Планка обвязки 1 метр, Donini', 20, true)
on conflict do nothing;
