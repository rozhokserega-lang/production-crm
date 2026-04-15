create or replace function public.web_get_articles_for_import()
returns table (
  section_name text,
  article text,
  item_name text,
  material text
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select distinct on (trim(iam.article))
    trim(iam.section_name)::text as section_name,
    trim(iam.article)::text as article,
    trim(iam.item_name)::text as item_name,
    trim(coalesce(iam.table_color, ''))::text as material
  from public.item_article_map iam
  where trim(coalesce(iam.article, '')) <> ''
    and trim(coalesce(iam.item_name, '')) <> ''
    and trim(coalesce(iam.section_name, '')) <> ''
  order by trim(iam.article), coalesce(iam.sort_order, 999), iam.updated_at desc nulls last;
$$;

grant execute on function public.web_get_articles_for_import() to anon, authenticated, service_role;
