-- Переход обвязки Авелла: 1158_50 / 600_50 → 1158_56 / 600_56 (ширина 56 мм).

begin;

-- 1) Склад: перенос остатков на новые коды
with merged as (
  select
    case strap_type
      when '1158_50' then '1158_56'
      when '600_50' then '600_56'
      else strap_type
    end as strap_type,
    color,
    sum(coalesce(qty, 0))::integer as qty
  from public.strap_stock
  where strap_type in ('1158_50', '600_50', '1158_56', '600_56')
  group by 1, 2
)
insert into public.strap_stock (strap_type, color, qty)
select strap_type, color, qty
from merged
where strap_type in ('1158_56', '600_56')
on conflict (strap_type, color) do update
set qty = excluded.qty,
    updated_at = now();

delete from public.strap_stock
where strap_type in ('1158_50', '600_50');

-- 2) Каталог привязки деталей к изделиям
update public.furniture_detail_item_map
set
  detail_name_pattern = replace(replace(detail_name_pattern, '1158_50', '1158_56'), '600_50', '600_56'),
  updated_at = now()
where detail_name_pattern ilike '%1158_50%'
   or detail_name_pattern ilike '%600_50%';

-- 3) Шаблоны мебели (JSON details)
update public.furniture_custom_templates
set details = replace(replace(details::text, '1158_50', '1158_56'), '600_50', '600_56')::jsonb
where details::text ilike '%1158_50%'
   or details::text ilike '%600_50%';

-- 4) План отгрузки и ячейки
update public.shipment_plan_cells
set item = '1158_56', updated_at = now()
where item = '1158_50';

update public.shipment_plan_cells
set item = '600_56', updated_at = now()
where item = '600_50';

update public.shipment_cells
set item = '1158_56', updated_at = now()
where item = '1158_50';

update public.shipment_cells
set item = '600_56', updated_at = now()
where item = '600_50';

-- 5) Активные заказы в цеху (историю отгруженных не трогаем)
update public.orders
set item = '1158_56'
where trim(coalesce(item, '')) in ('1158_50', 'Обвязка (1158_50)')
  and coalesce(shipped, false) = false;

update public.orders
set item = '600_56'
where trim(coalesce(item, '')) in ('600_50', 'Обвязка (600_50)')
  and coalesce(shipped, false) = false;

commit;
