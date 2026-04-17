-- Global color mapping correction:
-- old "Бардолино" should be represented as stock color "Сонома / бардолино".

update public.item_article_map
set
  table_color = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(table_color, ''))) = 'бардолино';

update public.shipment_plan_cells
set
  material = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(material, ''))) = 'бардолино';

update public.shipment_cells
set
  material = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(material, ''))) = 'бардолино';
