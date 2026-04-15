create or replace function public.web_get_furniture_detail_articles(
  p_product_name text default null
)
returns table (
  product_name text,
  detail_name_pattern text,
  section_name text,
  article text,
  item_name text,
  table_color text,
  map_sort integer
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with active_detail_map as (
    select
      trim(m.product_name) as product_name,
      trim(m.detail_name_pattern) as detail_name_pattern,
      trim(m.item_name_exact) as item_name_exact,
      m.sort_order
    from public.furniture_detail_item_map m
    where m.is_active = true
      and (p_product_name is null or trim(p_product_name) = '' or lower(trim(m.product_name)) = lower(trim(p_product_name)))
  ),
  active_product_sections as (
    select
      trim(pm.product_name) as product_name,
      trim(pm.section_name) as section_name
    from public.furniture_product_map pm
    where pm.is_active = true
      and coalesce(trim(pm.section_name), '') <> ''
  ),
  base_product_articles as (
    select
      ps.product_name,
      ps.section_name,
      iam.article,
      iam.item_name,
      iam.table_color
    from active_product_sections ps
    join public.item_article_map iam
      on iam.section_name = ps.section_name
  )
  select
    dm.product_name,
    dm.detail_name_pattern,
    bpa.section_name,
    bpa.article,
    bpa.item_name,
    bpa.table_color,
    dm.sort_order as map_sort
  from active_detail_map dm
  join base_product_articles bpa
    on lower(bpa.product_name) = lower(dm.product_name)
  order by dm.product_name, dm.sort_order, bpa.section_name, bpa.item_name, bpa.article;
$$;

grant execute on function public.web_get_furniture_detail_articles(text) to anon, authenticated, service_role;
