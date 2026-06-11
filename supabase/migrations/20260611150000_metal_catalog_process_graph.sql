-- Metal catalog: process_graph (blueprint DAG) alongside legacy stage_route.

alter table public.metal_product_catalog
  add column if not exists process_graph jsonb;

create or replace function public.metal_linear_route_to_graph(p_route text[])
returns jsonb
language plpgsql
immutable
as $$
declare
  v_nodes jsonb := '[]'::jsonb;
  v_edges jsonb := '[]'::jsonb;
  v_prev text := 'start';
  v_stage text;
  v_i integer := 0;
  v_id text;
  v_route text[] := coalesce(p_route, array['laser', 'bending', 'welding', 'painting']);
begin
  v_nodes := v_nodes || jsonb_build_object('id', 'start', 'kind', 'start', 'x', 40, 'y', 140);

  if array_length(v_route, 1) is null or array_length(v_route, 1) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;

  foreach v_stage in array v_route loop
    v_id := 's' || v_i::text;
    v_nodes := v_nodes || jsonb_build_object(
      'id', v_id,
      'kind', 'stage',
      'stage', lower(trim(v_stage)),
      'x', 200 + v_i * 180,
      'y', 140
    );
    v_edges := v_edges || jsonb_build_object(
      'id', 'e-' || v_prev || '-' || v_id,
      'from', v_prev,
      'to', v_id
    );
    v_prev := v_id;
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object('nodes', v_nodes, 'edges', v_edges);
end;
$$;

update public.metal_product_catalog c
set process_graph = public.metal_linear_route_to_graph(c.stage_route)
where c.process_graph is null;

alter table public.metal_product_catalog
  alter column process_graph set default public.metal_linear_route_to_graph(array['laser', 'bending', 'welding', 'painting']);

update public.metal_product_catalog c
set process_graph = public.metal_linear_route_to_graph(array['laser', 'bending', 'welding', 'painting'])
where c.process_graph is null;

alter table public.metal_product_catalog
  alter column process_graph set not null;

drop function if exists public.web_list_metal_catalog(boolean);

create or replace function public.web_list_metal_catalog(
  p_active_only boolean default true
)
returns table(
  article       text,
  name          text,
  is_active     boolean,
  stage_route   text[],
  process_graph jsonb,
  updated_at    timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    c.article,
    c.name,
    c.is_active,
    c.stage_route,
    c.process_graph,
    c.updated_at
  from public.metal_product_catalog c
  where not coalesce(p_active_only, true) or c.is_active = true
  order by c.article;
$$;

drop function if exists public.web_upsert_metal_catalog_item(text, text, boolean, text[]);

create or replace function public.web_upsert_metal_catalog_item(
  p_article       text,
  p_name          text,
  p_is_active     boolean default true,
  p_stage_route   text[] default null,
  p_process_graph jsonb default null
)
returns table(
  article       text,
  name          text,
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

  insert into public.metal_product_catalog as c (article, name, is_active, stage_route, process_graph)
  values (v_article, v_name, coalesce(p_is_active, true), v_stage_route, v_process_graph)
  on conflict on constraint metal_product_catalog_pkey do update
    set name          = excluded.name,
        is_active     = excluded.is_active,
        stage_route   = excluded.stage_route,
        process_graph = excluded.process_graph,
        updated_at    = now();

  return query
    select c.article, c.name, c.is_active, c.stage_route, c.process_graph, c.updated_at
    from public.metal_product_catalog c
    where c.article = v_article;
end;
$$;

grant execute on function public.web_list_metal_catalog(boolean) to authenticated, anon, service_role;
grant execute on function public.web_upsert_metal_catalog_item(text, text, boolean, text[], jsonb) to authenticated, anon, service_role;
