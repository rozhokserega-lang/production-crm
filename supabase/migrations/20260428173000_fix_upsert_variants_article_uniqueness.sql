-- item_article_map has a PK/unique key by article, so manual upserts must handle collisions.
-- Strategy:
-- - If an article is already present in a non-manual row (xlsx_catalog / other), fail with a clear error.
-- - If an article exists in manual rows (maybe for another item), remove it before inserting new variants.

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
  v_conflict_source text;
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

  -- Validate and insert variants.
  for v_row in select * from jsonb_array_elements(v_variants)
  loop
    v_article := trim(coalesce(v_row->>'article', ''));
    v_color := trim(coalesce(v_row->>'color', ''));
    if v_article = '' or v_color = '' then
      continue;
    end if;

    -- If article is already in catalog (non-manual), do not override silently.
    select iam.source
      into v_conflict_source
      from public.item_article_map iam
      where trim(iam.article) = v_article
      limit 1;
    if found and coalesce(v_conflict_source, '') <> '' and v_conflict_source <> 'manual' then
      raise exception 'article % already exists in catalog (source=%)', v_article, v_conflict_source;
    end if;

    -- If the same article exists as manual somewhere else, remove it (re-assign).
    delete from public.item_article_map
      where source = 'manual'
        and trim(article) = v_article;

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

