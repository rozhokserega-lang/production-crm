-- ============================================================
-- Fix: один и тот же item выводился в двух секциях.
--
-- Причина: web_get_section_articles объединяет «настоящую» секцию из
-- справочника item_article_map и «угаданную» секцию из web_get_plan_catalog
-- (последняя выводит секцию по жёсткому CASE по названию). Дубль отсекался
-- только при совпадении И секции, И изделия — поэтому изделие с реальной
-- секцией (напр. «Stabile», «Классико +») дополнительно показывалось под
-- угаданной («Прочее», «Классико» и т.п.).
--
-- Решение: при слиянии отбрасывать строку из плана-каталога, если изделие
-- уже присутствует в справочнике item_article_map (под любой секцией).
-- Ничего не удаляется — меняется только логика выборки.
-- ============================================================

create or replace function public.web_get_section_articles(p_section_name text default null::text)
 returns table(section_name text, article text, item_name text, material text)
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with params as (
    select
      trim(coalesce(p_section_name, ''))::text as req_section,
      regexp_replace(trim(coalesce(p_section_name, '')), '\s+белый\s*$', '', 'i')::text as base_section,
      (trim(coalesce(p_section_name, '')) ~* '\s+белый\s*$') as is_white_alias
  ),
  catalog as (
    select
      trim(iam.section_name)::text as section_name,
      trim(iam.article)::text as article,
      regexp_replace(trim(iam.item_name), '\.+\s*$', '')::text as item_name,
      trim(iam.table_color)::text as material,
      lower(regexp_replace(trim(iam.item_name), '\.+\s*$', ''))::text as norm_item_name,
      coalesce(iam.sort_order, 999)::integer as sort_order
    from public.item_article_map iam
    where trim(coalesce(iam.section_name, '')) <> ''
      and trim(coalesce(iam.table_color, '')) <> ''
      and trim(coalesce(iam.item_name, '')) <> ''
  ),
  src as (
    select distinct
      trim(pc.section_name)::text as section_name,
      regexp_replace(trim(pc.item_name), '\.+\s*$', '')::text as item_name,
      trim(pc.material)::text as material,
      lower(regexp_replace(trim(pc.item_name), '\.+\s*$', ''))::text as norm_item_name
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
      s.norm_item_name,
      999::integer as sort_order
    from src s
    left join public.item_article_map iam
      on lower(regexp_replace(trim(coalesce(iam.item_name, '')), '\.+\s*$', '')) = s.norm_item_name
  ),
  merged as (
    select c.section_name, c.article, c.item_name, c.material, c.norm_item_name, c.sort_order
    from catalog c
    union all
    select x.section_name, x.article, x.item_name, x.material, x.norm_item_name, x.sort_order
    from common_src x
    where not exists (
      select 1
      from catalog c2
      where c2.norm_item_name = x.norm_item_name
    )
  ),
  result_regular as (
    select m.section_name, m.article, m.item_name, m.material, m.sort_order
    from merged m
    cross join params p
    where p.req_section = '' or m.section_name = p.req_section
  ),
  white_alias_sections as (
    select
      trim(sc.section_name)::text as alias_section,
      regexp_replace(trim(sc.section_name), '\s+белый\s*$', '', 'i')::text as base_section
    from public.section_catalog sc
    where coalesce(sc.is_active, true)
      and trim(coalesce(sc.section_name, '')) ~* '\s+белый\s*$'
  ),
  result_white_alias_full as (
    select
      was.alias_section as section_name,
      c.article,
      c.item_name,
      c.material,
      c.sort_order
    from white_alias_sections was
    join catalog c
      on c.section_name = was.base_section
    where lower(c.item_name) like ('%' || lower('белые ноги') || '%')
  ),
  result_white_alias_single as (
    select
      p.req_section as section_name,
      c.article,
      c.item_name,
      c.material,
      c.sort_order
    from params p
    join catalog c
      on c.section_name = p.base_section
    where p.is_white_alias
      and lower(c.item_name) like ('%' || lower('белые ноги') || '%')
  ),
  final_rows as (
    select section_name, article, item_name, material, sort_order from result_white_alias_single
    union all
    select rwf.section_name, rwf.article, rwf.item_name, rwf.material, rwf.sort_order
    from result_white_alias_full rwf
    cross join params p
    where p.req_section = ''
    union all
    select r.section_name, r.article, r.item_name, r.material, r.sort_order
    from result_regular r
    cross join params p
    where not p.is_white_alias
  )
  select distinct
    f.section_name,
    f.article,
    f.item_name,
    f.material
  from final_rows f
  order by f.section_name, f.item_name, f.material;
$function$;
