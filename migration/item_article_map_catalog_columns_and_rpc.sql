-- Catalog columns for item_article_map (Соответствия.xlsx) + web_get_section_articles driven by table_color.

alter table public.item_article_map
  add column if not exists section_name text,
  add column if not exists table_color text,
  add column if not exists sort_order integer not null default 999;

comment on column public.item_article_map.section_name is
  'Секция UI (как в public.section_catalog / заголовки в Excel).';
comment on column public.item_article_map.table_color is
  'Цвет/материал для таблицы из файла соответствий (колонка C).';
comment on column public.item_article_map.sort_order is
  'Порядок строк внутри секции (как в Excel, шаг 10).';

create or replace function public.web_get_section_articles(p_section_name text default null)
returns table (
  section_name text,
  article text,
  item_name text,
  material text
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
stable
as $$
  with catalog as (
    select
      trim(iam.section_name)::text as section_name,
      trim(iam.article)::text as article,
      trim(iam.item_name)::text as item_name,
      trim(iam.table_color)::text as material,
      coalesce(iam.sort_order, 999)::integer as sort_order
    from public.item_article_map iam
    where trim(coalesce(iam.section_name, '')) <> ''
      and trim(coalesce(iam.table_color, '')) <> ''
  ),
  src as (
    select distinct
      trim(pc.section_name)::text as section_name,
      trim(pc.item_name)::text as item_name,
      trim(pc.material)::text as material
    from public.web_get_plan_catalog() pc
    where trim(coalesce(pc.section_name, '')) <> ''
      and trim(coalesce(pc.item_name, '')) <> ''
      and trim(coalesce(pc.material, '')) <> ''
  ),
  common_src as (
    select
      s.section_name,
      coalesce(iam.article, 'ITEM-' || substr(md5(s.item_name || '|' || s.material), 1, 10))::text as article,
      s.item_name,
      s.material,
      999::integer as sort_order
    from src s
    left join public.item_article_map iam
      on trim(coalesce(iam.item_name, '')) = s.item_name
  ),
  merged as (
    select c.section_name, c.article, c.item_name, c.material, c.sort_order
    from catalog c
    union all
    select x.section_name, x.article, x.item_name, x.material, x.sort_order
    from common_src x
    where not exists (
      select 1
      from catalog c2
      where c2.section_name = x.section_name
        and trim(c2.item_name) = trim(x.item_name)
    )
  )
  select
    m.section_name,
    m.article,
    m.item_name,
    m.material
  from merged m
  where p_section_name is null or trim(p_section_name) = '' or m.section_name = trim(p_section_name)
  order by
    m.section_name,
    m.sort_order,
    m.item_name,
    m.material;
$$;
