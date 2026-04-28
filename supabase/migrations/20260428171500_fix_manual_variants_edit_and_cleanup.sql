-- Fix manual furniture variants:
-- - Editing should fetch ONLY manual variants (source='manual') for an item
-- - Upsert should replace all manual variants for that item across sections to avoid leftovers

create or replace function public.web_get_manual_item_article_variants(
  p_item_name text
)
returns table(
  section_name text,
  item_name text,
  article text,
  material text
)
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $$
  select
    trim(iam.section_name)::text as section_name,
    trim(iam.item_name)::text as item_name,
    trim(iam.article)::text as article,
    trim(iam.table_color)::text as material
  from public.item_article_map iam
  where iam.source = 'manual'
    and lower(trim(iam.item_name)) = lower(trim(coalesce(p_item_name, '')))
    and trim(coalesce(iam.section_name, '')) <> ''
    and trim(coalesce(iam.article, '')) <> ''
    and trim(coalesce(iam.table_color, '')) <> ''
  order by trim(iam.section_name), trim(iam.article), trim(iam.table_color);
$$;

grant execute on function public.web_get_manual_item_article_variants(text) to authenticated;

create or replace function public.web_upsert_item_article_map_variants(
  p_section_name text,
  p_item_name text,
  p_variants jsonb default '[]'::jsonb,
  p_sort_order integer default 999
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_section text := trim(coalesce(p_section_name, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_sort integer := coalesce(p_sort_order, 999);
  v_variants jsonb := coalesce(p_variants, '[]'::jsonb);
  v_count integer := 0;
  v_row jsonb;
  v_article text;
  v_color text;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_section = '' then
    raise exception 'section_name is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if jsonb_typeof(v_variants) <> 'array' then
    raise exception 'variants must be a json array';
  end if;
  if v_sort < 0 then v_sort := 999; end if;

  insert into public.section_catalog(section_name, sort_order, is_active)
  values (v_section, v_sort, true)
  on conflict (section_name)
  do update set is_active = true;

  -- Replace ALL manual variants for this item (across sections) to avoid stale duplicates.
  delete from public.item_article_map
  where source = 'manual'
    and lower(trim(coalesce(item_name, ''))) = lower(v_item);

  for v_row in select * from jsonb_array_elements(v_variants)
  loop
    v_article := trim(coalesce(v_row->>'article', ''));
    v_color := trim(coalesce(v_row->>'color', ''));
    if v_article = '' or v_color = '' then
      continue;
    end if;
    insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
    values (v_article, v_item, 'manual', v_section, v_color, v_sort);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no valid variants provided (need article+color)';
  end if;

  return jsonb_build_object(
    'ok', true,
    'section_name', v_section,
    'item_name', v_item,
    'rows_created', v_count
  );
end;
$$;

grant execute on function public.web_upsert_item_article_map_variants(text, text, jsonb, integer) to authenticated;

