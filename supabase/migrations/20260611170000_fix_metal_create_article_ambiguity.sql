-- Fix "column reference article is ambiguous" in web_create_metal_work_item
-- (RETURNS TABLE output columns shadow table column names in PL/pgSQL).

create or replace function public.web_create_metal_work_item(
  p_article text,
  p_name text,
  p_week text,
  p_qty numeric
)
returns table(
  id bigint,
  article text,
  name text,
  week text,
  qty numeric,
  current_stage text,
  stage_status text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_week text := nullif(trim(coalesce(p_week, '')), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_route text[];
  v_graph jsonb;
  v_plan jsonb;
  v_stage text;
  v_new_id bigint;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_article = '' then raise exception 'article required'; end if;
  if v_name = '' then raise exception 'name required'; end if;
  if v_qty <= 0 then raise exception 'qty must be > 0'; end if;

  insert into public.metal_product_catalog(article, name, is_active)
  values (v_article, v_name, true)
  on conflict on constraint metal_product_catalog_pkey
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  select
    coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route)),
    coalesce(c.stage_route, array['laser', 'bending', 'welding', 'painting'])
  into v_graph, v_route
  from public.metal_product_catalog c
  where c.article = v_article;

  v_plan := public.metal_extract_fork_plan(v_graph);
  if v_plan->>'mode' = 'linear' then
    select array_agg(x order by ord) into v_route
    from (
      select value::text as x, ordinality as ord
      from jsonb_array_elements_text(coalesce(v_plan->'route', to_jsonb(v_route))) with ordinality
    ) t;
  end if;

  if coalesce(array_length(v_route, 1), 0) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  v_stage := lower(trim(coalesce(v_route[1], 'laser')));

  insert into public.metal_work_items(
    article, name, week, qty,
    stage_route, route_idx, stage_done_qty,
    current_stage, stage_status, status,
    process_graph
  )
  values (
    v_article, v_name, v_week, v_qty,
    v_route, 0, 0,
    v_stage, 'queued', 'planned',
    v_graph
  )
  returning metal_work_items.id into v_new_id;

  return query
  select
    mwi.id,
    mwi.article,
    mwi.name,
    mwi.week,
    mwi.qty,
    mwi.current_stage,
    mwi.stage_status,
    mwi.status,
    mwi.created_at,
    mwi.updated_at
  from public.metal_work_items mwi
  where mwi.id = v_new_id;

  perform public.web_audit_log_event(
    'create_metal_work_item',
    'metal_work_items',
    v_new_id::text,
    jsonb_build_object(
      'article', v_article,
      'name', v_name,
      'week', v_week,
      'qty', v_qty,
      'stage_route', v_route,
      'status', 'planned'
    )
  );
end;
$$;

grant execute on function public.web_create_metal_work_item(text, text, text, numeric) to anon, authenticated, service_role;
