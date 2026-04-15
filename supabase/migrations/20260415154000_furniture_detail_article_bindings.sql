create table if not exists public.furniture_detail_item_map (
  id bigserial primary key,
  product_name text not null,
  detail_name_pattern text not null,
  item_name_exact text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_furniture_detail_item_map_key
  on public.furniture_detail_item_map (
    lower(trim(product_name)),
    lower(trim(detail_name_pattern)),
    lower(trim(item_name_exact))
  );

insert into public.furniture_detail_item_map (
  product_name,
  detail_name_pattern,
  item_name_exact,
  sort_order
)
values
  ('Донини Гранде', '%обвязка%750_80%', 'Обвязка (750_80)', 10),
  ('Донини Гранде', '%обвязка%618_80%', 'Обвязка (618_80)', 20),
  ('Донини Гранде', '%обвязка%600_80%', 'Обвязка (600_80)', 30),
  ('Донини Гранде', '%обвязка%586_80%', 'Обвязка (586_80)', 40)
on conflict do nothing;

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
  )
  select
    dm.product_name,
    dm.detail_name_pattern,
    iam.section_name,
    iam.article,
    iam.item_name,
    iam.table_color,
    dm.sort_order as map_sort
  from active_detail_map dm
  join active_product_sections ps
    on lower(ps.product_name) = lower(dm.product_name)
  join public.item_article_map iam
    on iam.section_name = ps.section_name
   and lower(trim(iam.item_name)) = lower(dm.item_name_exact)
  order by dm.product_name, dm.sort_order, iam.section_name, iam.article;
$$;

grant select on public.furniture_detail_item_map to anon, authenticated, service_role;
grant execute on function public.web_get_furniture_detail_articles(text) to anon, authenticated, service_role;
