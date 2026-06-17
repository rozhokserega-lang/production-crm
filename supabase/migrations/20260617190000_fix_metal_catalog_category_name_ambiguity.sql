-- Fix "column reference name is ambiguous" in category upsert RPCs.
-- PL/pgSQL OUT columns from RETURNS TABLE shadow unqualified column names.

create or replace function public.web_upsert_metal_catalog_item(
  p_article       text,
  p_name          text,
  p_is_active     boolean default true,
  p_stage_route   text[] default null,
  p_process_graph jsonb default null,
  p_category      text default null
)
returns table(
  article       text,
  name          text,
  category      text,
  is_active     boolean,
  stage_route   text[],
  process_graph jsonb,
  updated_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article       text   := upper(trim(coalesce(p_article, '')));
  v_name          text   := trim(coalesce(p_name, ''));
  v_category      text   := trim(coalesce(p_category, ''));
  v_stage_route   text[] := coalesce(p_stage_route, array['laser', 'bending', 'welding', 'painting']);
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
    if v_process_graph -> 'nodes' is null or jsonb_array_length(v_process_graph -> 'nodes') < 1 then
      raise exception 'process_graph must contain nodes';
    end if;
  else
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if array_length(v_stage_route, 1) is null or array_length(v_stage_route, 1) < 1 then
    raise exception 'stage_route must have at least one stage';
  end if;
  if not (v_stage_route <@ array['laser', 'saw', 'bending', 'welding', 'painting']) then
    raise exception 'stage_route contains invalid stage(s)';
  end if;

  if v_category <> '' then
    insert into public.metal_catalog_categories as cat (name, sort_order)
    values (v_category, 0)
    on conflict on constraint metal_catalog_categories_pkey do nothing;
  end if;

  insert into public.metal_product_catalog as c (article, name, category, is_active, stage_route, process_graph)
  values (v_article, v_name, v_category, coalesce(p_is_active, true), v_stage_route, v_process_graph)
  on conflict on constraint metal_product_catalog_pkey do update
    set name          = excluded.name,
        category      = excluded.category,
        is_active     = excluded.is_active,
        stage_route   = excluded.stage_route,
        process_graph = excluded.process_graph,
        updated_at    = now();

  return query
    select c.article, c.name, coalesce(nullif(trim(c.category), ''), 'Без категории'), c.is_active, c.stage_route, c.process_graph, c.updated_at
    from public.metal_product_catalog c
    where c.article = v_article;
end;
$$;

create or replace function public.web_upsert_metal_catalog_category(
  p_name               text,
  p_is_hidden          boolean default null,
  p_stage_route        text[] default null,
  p_process_graph      jsonb default null,
  p_apply_route_to_items boolean default false
)
returns table(
  name          text,
  is_hidden     boolean,
  sort_order    integer,
  stage_route   text[],
  process_graph jsonb,
  item_count    bigint,
  updated_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_stage_route text[];
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_name = '' then
    raise exception 'category name required';
  end if;

  insert into public.metal_catalog_categories as cat (name)
  values (v_name)
  on conflict on constraint metal_catalog_categories_pkey do nothing;

  select cat.stage_route, cat.process_graph
  into v_stage_route, v_process_graph
  from public.metal_catalog_categories cat
  where cat.name = v_name;

  if p_stage_route is not null then
    v_stage_route := p_stage_route;
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
  elsif p_stage_route is not null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if v_stage_route is null or array_length(v_stage_route, 1) is null then
    v_stage_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  if v_process_graph is null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  update public.metal_catalog_categories cat
  set is_hidden = coalesce(p_is_hidden, cat.is_hidden),
      stage_route = v_stage_route,
      process_graph = v_process_graph
  where cat.name = v_name;

  if coalesce(p_apply_route_to_items, false) then
    update public.metal_product_catalog c
    set stage_route = v_stage_route,
        process_graph = v_process_graph,
        updated_at = now()
    where coalesce(nullif(trim(c.category), ''), 'Без категории') = v_name;
  end if;

  return query
  select
    row.name,
    row.is_hidden,
    row.sort_order,
    row.stage_route,
    row.process_graph,
    row.item_count,
    row.updated_at
  from public.web_list_metal_catalog_categories() as row
  where row.name = v_name;
end;
$$;
