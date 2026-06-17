-- Deactivate legacy catalog rows without category (not part of Sergey import).
-- Remove empty pseudo-category from category bar.

update public.metal_product_catalog c
set is_active = false,
    updated_at = now()
where c.is_active
  and coalesce(nullif(trim(c.category), ''), '') = '';

delete from public.metal_catalog_categories cat
where cat.name = 'Без категории'
  and not exists (
    select 1
    from public.metal_product_catalog c
    where c.is_active
      and coalesce(nullif(trim(c.category), ''), 'Без категории') = cat.name
  );
