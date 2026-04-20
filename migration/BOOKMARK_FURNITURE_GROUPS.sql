-- =========================================================
-- BOOKMARK: Furniture groups and bulk items
-- =========================================================
-- Purpose:
-- 1) Create/activate section in section_catalog
-- 2) Create/activate product group in furniture_product_map
-- 3) Bulk upsert items (article + item_name + color) into item_article_map
-- 4) Verify via web_get_section_catalog / web_get_section_articles
--
-- Usage:
-- - Copy "UNIVERSAL TEMPLATE" block
-- - Replace group name, sort orders, and VALUES rows
-- - Run in Supabase SQL Editor

-- =========================================================
-- UNIVERSAL TEMPLATE
-- =========================================================
/*
begin;

with grp as (
  select
    'TB Siena X'::text as section_name,
    'TB Siena X'::text as product_name,
    240::int as section_sort_order,
    75::int as product_sort_order
)
insert into public.section_catalog(section_name, sort_order, is_active)
select g.section_name, g.section_sort_order, true
from grp g
on conflict (section_name) do update
set
  sort_order = excluded.sort_order,
  is_active = true;

with grp as (
  select
    'TB Siena X'::text as section_name,
    'TB Siena X'::text as product_name,
    75::int as product_sort_order
)
insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
select g.product_name, g.section_name, null, g.product_sort_order, true
from grp g
on conflict do nothing;

with grp as (
  select 'TB Siena X'::text as section_name
),
items(article, item_name, table_color) as (
  values
    ('ARTICLE_1', 'Name 1', 'Color 1'),
    ('ARTICLE_2', 'Name 2', 'Color 2')
)
insert into public.item_article_map (section_name, article, item_name, table_color)
select
  g.section_name,
  i.article,
  i.item_name,
  i.table_color
from grp g
join items i on true
on conflict (article) do update
set
  section_name = excluded.section_name,
  item_name    = excluded.item_name,
  table_color  = excluded.table_color,
  updated_at   = now();

select * from public.web_get_section_catalog() where section_name = 'TB Siena X';

select section_name, article, item_name, material
from public.web_get_section_articles('TB Siena X')
order by item_name;

commit;
*/

-- =========================================================
-- STRAP TEMPLATE (constructor positions for a product)
-- =========================================================
-- Purpose:
-- - Add strap/detail rules into furniture_detail_item_map
-- - Rules are later consumed by web_get_furniture_detail_articles
-- - Works for constructor "Конструктор планок (обвязка)"
--
-- Notes:
-- - product_name must exist (or be created) in furniture_product_map.
-- - item_name_exact must match an existing item in item_article_map
--   for the mapped section(s), otherwise RPC join can return nothing.
/*
begin;

-- Ensure product exists in furniture_product_map
insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
values
  ('TB Siena X', 'TB Siena X', null, 75, true)
on conflict do nothing;

-- Upsert strap rules
with rules(product_name, detail_name_pattern, item_name_exact, sort_order, is_active) as (
  values
    ('TB Siena X', '%обвязка%1000_80%', 'Планка обвязки 1 метр, Donini', 10, true),
    ('TB Siena X', '%обвязка%558_80%',  'Планка обвязки 1 метр, Donini', 20, true),
    ('TB Siena X', '%бока%316_167%',    'Бока (316_167)',                30, true)
)
insert into public.furniture_detail_item_map (
  product_name, detail_name_pattern, item_name_exact, sort_order, is_active
)
select r.product_name, r.detail_name_pattern, r.item_name_exact, r.sort_order, r.is_active
from rules r
on conflict (
  lower(trim(product_name)),
  lower(trim(detail_name_pattern)),
  lower(trim(item_name_exact))
)
do update set
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Verify
select
  product_name,
  detail_name_pattern,
  item_name_exact,
  sort_order,
  is_active
from public.furniture_detail_item_map
where lower(trim(product_name)) = lower('TB Siena X')
order by sort_order, detail_name_pattern;

select *
from public.web_get_furniture_detail_articles('TB Siena X')
order by map_sort, item_name;

commit;
*/

-- =========================================================
-- STRAP SAFE MODE (insert only new strap rules)
-- =========================================================
-- Behavior:
-- - Does NOT overwrite existing strap rules.
-- - Inserts only missing combinations by unique key:
--   (product_name, detail_name_pattern, item_name_exact)
-- - Returns reports: SKIPPED_EXISTING + INSERTED
/*
begin;

insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
values
  ('TB Siena X', 'TB Siena X', null, 75, true)
on conflict do nothing;

-- Report existing rules
with rules(product_name, detail_name_pattern, item_name_exact, sort_order, is_active) as (
  values
    ('TB Siena X', '%обвязка%1000_80%', 'Планка обвязки 1 метр, Donini', 10, true),
    ('TB Siena X', '%обвязка%558_80%',  'Планка обвязки 1 метр, Donini', 20, true),
    ('TB Siena X', '%бока%316_167%',    'Бока (316_167)',                30, true)
)
select
  'SKIPPED_EXISTING'::text as status,
  m.product_name,
  m.detail_name_pattern,
  m.item_name_exact,
  m.sort_order,
  m.is_active
from rules r
join public.furniture_detail_item_map m
  on lower(trim(m.product_name)) = lower(trim(r.product_name))
 and lower(trim(m.detail_name_pattern)) = lower(trim(r.detail_name_pattern))
 and lower(trim(m.item_name_exact)) = lower(trim(r.item_name_exact))
order by m.product_name, m.sort_order;

-- Insert only missing rules
with rules(product_name, detail_name_pattern, item_name_exact, sort_order, is_active) as (
  values
    ('TB Siena X', '%обвязка%1000_80%', 'Планка обвязки 1 метр, Donini', 10, true),
    ('TB Siena X', '%обвязка%558_80%',  'Планка обвязки 1 метр, Donini', 20, true),
    ('TB Siena X', '%бока%316_167%',    'Бока (316_167)',                30, true)
),
to_insert as (
  select r.*
  from rules r
  left join public.furniture_detail_item_map m
    on lower(trim(m.product_name)) = lower(trim(r.product_name))
   and lower(trim(m.detail_name_pattern)) = lower(trim(r.detail_name_pattern))
   and lower(trim(m.item_name_exact)) = lower(trim(r.item_name_exact))
  where m.id is null
),
ins as (
  insert into public.furniture_detail_item_map (
    product_name, detail_name_pattern, item_name_exact, sort_order, is_active
  )
  select
    t.product_name,
    t.detail_name_pattern,
    t.item_name_exact,
    t.sort_order,
    t.is_active
  from to_insert t
  returning product_name, detail_name_pattern, item_name_exact, sort_order, is_active
)
select
  'INSERTED'::text as status,
  i.product_name,
  i.detail_name_pattern,
  i.item_name_exact,
  i.sort_order,
  i.is_active
from ins i
order by i.product_name, i.sort_order;

select *
from public.web_get_furniture_detail_articles('TB Siena X')
order by map_sort, item_name;

commit;
*/

-- =========================================================
-- SAFE MODE TEMPLATE (insert only new articles)
-- =========================================================
-- Behavior:
-- - Does NOT overwrite existing article mappings.
-- - Inserts only articles that do not exist yet.
-- - Returns two reports:
--   1) already existing articles (skipped)
--   2) inserted articles
/*
begin;

with grp as (
  select
    'TB Siena X'::text as section_name,
    'TB Siena X'::text as product_name,
    240::int as section_sort_order,
    75::int as product_sort_order
),
items(article, item_name, table_color) as (
  values
    ('ARTICLE_1', 'Name 1', 'Color 1'),
    ('ARTICLE_2', 'Name 2', 'Color 2')
),
existing as (
  select i.article, m.section_name as existing_section, m.item_name as existing_item_name, m.table_color as existing_color
  from items i
  join public.item_article_map m on m.article = i.article
)
insert into public.section_catalog(section_name, sort_order, is_active)
select g.section_name, g.section_sort_order, true
from grp g
on conflict (section_name) do update
set
  sort_order = excluded.sort_order,
  is_active = true;

with grp as (
  select
    'TB Siena X'::text as section_name,
    'TB Siena X'::text as product_name,
    75::int as product_sort_order
)
insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
select g.product_name, g.section_name, null, g.product_sort_order, true
from grp g
on conflict do nothing;

-- Report skipped rows (already exist)
with items(article, item_name, table_color) as (
  values
    ('ARTICLE_1', 'Name 1', 'Color 1'),
    ('ARTICLE_2', 'Name 2', 'Color 2')
)
select
  'SKIPPED_EXISTING'::text as status,
  i.article,
  m.section_name,
  m.item_name,
  m.table_color
from items i
join public.item_article_map m on m.article = i.article
order by i.article;

-- Insert only missing rows
with grp as (
  select 'TB Siena X'::text as section_name
),
items(article, item_name, table_color) as (
  values
    ('ARTICLE_1', 'Name 1', 'Color 1'),
    ('ARTICLE_2', 'Name 2', 'Color 2')
),
to_insert as (
  select i.*
  from items i
  left join public.item_article_map m on m.article = i.article
  where m.article is null
),
ins as (
  insert into public.item_article_map (section_name, article, item_name, table_color)
  select g.section_name, t.article, t.item_name, t.table_color
  from grp g
  join to_insert t on true
  returning section_name, article, item_name, table_color
)
select
  'INSERTED'::text as status,
  article,
  section_name,
  item_name,
  table_color
from ins
order by article;

select section_name, article, item_name, material
from public.web_get_section_articles('TB Siena X')
order by item_name;

commit;
*/

-- =========================================================
-- PRESET: TB Siena 2
-- =========================================================
/*
begin;

with grp as (
  select
    'TB Siena 2'::text as section_name,
    'TB Siena 2'::text as product_name,
    220::int as section_sort_order,
    65::int as product_sort_order
)
insert into public.section_catalog(section_name, sort_order, is_active)
select g.section_name, g.section_sort_order, true
from grp g
on conflict (section_name) do update
set
  sort_order = excluded.sort_order,
  is_active = true;

with grp as (
  select
    'TB Siena 2'::text as section_name,
    'TB Siena 2'::text as product_name,
    65::int as product_sort_order
)
insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
select g.product_name, g.section_name, null, g.product_sort_order, true
from grp g
on conflict do nothing;

with grp as (
  select 'TB Siena 2'::text as section_name
),
items(article, item_name, table_color) as (
  values
    ('GxtvsS2IntGr',  'Siena 2. Интра',                 'Интра'),
    ('GXtvsS2HIntGr', 'Siena 2. Подвесная. Интра',      'Интра'),
    ('GxtvsS2UtGr',   'Siena 2. Юта',                   'Юта'),
    ('GxtvsS2VoBr',   'Siena 2. Дуб Вотан',             'Дуб вотан'),
    ('GXtvsS2HVoBr',  'Siena 2. Подвесная. Дуб Вотан',  'Дуб вотан')
)
insert into public.item_article_map (section_name, article, item_name, table_color)
select g.section_name, i.article, i.item_name, i.table_color
from grp g
join items i on true
on conflict (article) do update
set
  section_name = excluded.section_name,
  item_name    = excluded.item_name,
  table_color  = excluded.table_color,
  updated_at   = now();

select section_name, article, item_name, material
from public.web_get_section_articles('TB Siena 2')
order by item_name;

commit;
*/

-- =========================================================
-- PRESET: TB Siena 3
-- =========================================================
/*
begin;

with grp as (
  select
    'TB Siena 3'::text as section_name,
    'TB Siena 3'::text as product_name,
    230::int as section_sort_order,
    70::int as product_sort_order
)
insert into public.section_catalog(section_name, sort_order, is_active)
select g.section_name, g.section_sort_order, true
from grp g
on conflict (section_name) do update
set
  sort_order = excluded.sort_order,
  is_active = true;

with grp as (
  select
    'TB Siena 3'::text as section_name,
    'TB Siena 3'::text as product_name,
    70::int as product_sort_order
)
insert into public.furniture_product_map (
  product_name, section_name, item_name_pattern, sort_order, is_active
)
select g.product_name, g.section_name, null, g.product_sort_order, true
from grp g
on conflict do nothing;

with grp as (
  select 'TB Siena 3'::text as section_name
),
items(article, item_name, table_color) as (
  values
    ('GXtvsS3BSkyGeoW',   'Siena 3. Ночное небо',             'Темное небо'),
    ('GxtvsS3UtGeoW',     'Siena 3. Юта',                     'Юта'),
    ('GXtvsS3IntGeoW',    'Siena 3. Интра',                   'Интра'),
    ('GXtvsS3HBSkyGeoW',  'Siena 3. Подвесная. Ночное небо',  'Темное небо'),
    ('GXtvsS3HIntGeoW',   'Siena 3. Подвесная. Интра',        'Интра'),
    ('GXtvsS3HUtGeoW',    'Siena 3. Подвесная. Юта',          'Юта')
)
insert into public.item_article_map (section_name, article, item_name, table_color)
select g.section_name, i.article, i.item_name, i.table_color
from grp g
join items i on true
on conflict (article) do update
set
  section_name = excluded.section_name,
  item_name    = excluded.item_name,
  table_color  = excluded.table_color,
  updated_at   = now();

select section_name, article, item_name, material
from public.web_get_section_articles('TB Siena 3')
order by item_name;

commit;
*/
