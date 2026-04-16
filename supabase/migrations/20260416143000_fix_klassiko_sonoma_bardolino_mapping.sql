-- Fix Klassiko material mapping:
-- "Дуб сонома" / "Дуб бардолино натуральный" must use stock material "Сонома / бардолино".

update public.item_article_map iam
set
  table_color = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(iam.section_name, ''))) in ('классико', 'классико +')
  and (
    lower(trim(coalesce(iam.item_name, ''))) like '%дуб сонома%'
    or lower(trim(coalesce(iam.item_name, ''))) like '%дуб бардолино%'
    or lower(trim(coalesce(iam.table_color, ''))) = 'бардолино'
  );

update public.shipment_plan_cells spc
set
  material = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(spc.section_name, ''))) in ('классико', 'классико +')
  and lower(trim(coalesce(spc.material, ''))) = 'бардолино';

update public.shipment_cells sc
set
  material = 'Сонома / бардолино',
  updated_at = now()
where lower(trim(coalesce(sc.section_name, ''))) in ('классико', 'классико +')
  and lower(trim(coalesce(sc.material, ''))) = 'бардолино';
