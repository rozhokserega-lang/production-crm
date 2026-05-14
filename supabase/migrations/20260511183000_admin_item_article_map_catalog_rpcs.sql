-- Admin-only: full catalog item_article_map for UI "БД" tab (view / edit / sync).

create or replace function public.web_get_item_article_map_admin()
returns table (
  article text,
  item_name text,
  source text,
  section_name text,
  table_color text,
  sort_order integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['admin']);
  return query
  select
    trim(iam.article)::text as article,
    trim(coalesce(iam.item_name, ''))::text as item_name,
    trim(coalesce(iam.source, ''))::text as source,
    trim(coalesce(iam.section_name, ''))::text as section_name,
    trim(coalesce(iam.table_color, ''))::text as table_color,
    coalesce(iam.sort_order, 999)::integer as sort_order
  from public.item_article_map iam
  order by
    lower(trim(coalesce(iam.section_name, ''))),
    coalesce(iam.sort_order, 999),
    lower(trim(coalesce(iam.item_name, ''))),
    lower(trim(coalesce(iam.table_color, ''))),
    lower(trim(coalesce(iam.article, '')));
end;
$$;

create or replace function public.web_admin_upsert_item_article_map_row(
  p_prev_article text default null,
  p_article text default null,
  p_item_name text default null,
  p_source text default null,
  p_section_name text default null,
  p_table_color text default null,
  p_sort_order integer default 999
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prev text := nullif(trim(coalesce(p_prev_article, '')), '');
  v_art text := trim(coalesce(p_article, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_src text := trim(coalesce(nullif(trim(coalesce(p_source, '')), ''), 'manual'));
  v_section text := trim(coalesce(p_section_name, ''));
  v_color text := trim(coalesce(p_table_color, ''));
  v_sort integer := coalesce(p_sort_order, 999);
begin
  perform public.web_require_roles(array['admin']);

  if v_art = '' then
    raise exception 'article is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if v_sort < 0 then
    v_sort := 999;
  end if;

  -- Rename article: ensure target code is free (except the row we replace).
  if v_prev is not null and upper(v_prev) <> upper(v_art) then
    if exists (
      select 1
      from public.item_article_map x
      where trim(upper(coalesce(x.article, ''))) = trim(upper(v_art))
        and trim(upper(coalesce(x.article, ''))) <> trim(upper(v_prev))
    ) then
      raise exception 'article % already exists', v_art;
    end if;
    delete from public.item_article_map
    where trim(upper(coalesce(article, ''))) = trim(upper(v_prev));
  end if;

  delete from public.item_article_map
  where trim(upper(coalesce(article, ''))) = trim(upper(v_art));

  insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
  values (v_art, v_item, v_src, nullif(v_section, ''), nullif(v_color, ''), v_sort);

  if v_section <> '' then
    insert into public.section_catalog(section_name, sort_order, is_active)
    values (v_section, v_sort, true)
    on conflict (section_name)
    do update set is_active = true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'article', v_art,
    'item_name', v_item,
    'source', v_src,
    'section_name', v_section,
    'table_color', v_color,
    'sort_order', v_sort
  );
end;
$$;

create or replace function public.web_admin_delete_item_article_map_row(p_article text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_art text := trim(coalesce(p_article, ''));
  v_deleted integer := 0;
begin
  perform public.web_require_roles(array['admin']);
  if v_art = '' then
    raise exception 'article is required';
  end if;

  delete from public.item_article_map
  where trim(upper(coalesce(article, ''))) = trim(upper(v_art));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

grant execute on function public.web_get_item_article_map_admin() to authenticated;
grant execute on function public.web_admin_upsert_item_article_map_row(text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.web_admin_delete_item_article_map_row(text) to authenticated;
