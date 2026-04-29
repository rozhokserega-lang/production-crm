-- Helper RPC for the furniture constructor/editor:
-- Fetch item_article_map row(s) by article even when section_name/table_color are NULL.
-- This is needed to allow "Подставить" UX when the article exists in catalog (xlsx) but
-- section metadata wasn't filled in item_article_map.

create or replace function public.web_get_item_article_map_by_article(p_article text)
returns table(
  article text,
  item_name text,
  section_name text,
  material text,
  source text
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
stable
as $$
  select
    trim(iam.article)::text as article,
    trim(iam.item_name)::text as item_name,
    trim(coalesce(iam.section_name, ''))::text as section_name,
    trim(coalesce(iam.table_color, ''))::text as material,
    coalesce(iam.source, '')::text as source
  from public.item_article_map iam
  where trim(coalesce(iam.article, '')) <> ''
    and upper(trim(iam.article)) = upper(trim(coalesce(p_article, '')))
  limit 10;
$$;

grant execute on function public.web_get_item_article_map_by_article(text) to authenticated;

