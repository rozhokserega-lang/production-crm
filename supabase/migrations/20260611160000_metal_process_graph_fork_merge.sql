-- Runtime fork/merge for metal process graphs (parallel branches + merge gate).

alter table public.metal_work_items drop constraint if exists metal_work_items_status_check;
alter table public.metal_work_items
  add constraint metal_work_items_status_check
  check (status in ('planned', 'active', 'done', 'cancelled', 'split'));

alter table public.metal_work_items
  add column if not exists process_graph jsonb,
  add column if not exists fork_group_id uuid,
  add column if not exists fork_role text,
  add column if not exists parent_id bigint references public.metal_work_items(id) on delete set null,
  add column if not exists fork_meta jsonb;

alter table public.metal_work_items drop constraint if exists metal_work_items_fork_role_check;
alter table public.metal_work_items
  add constraint metal_work_items_fork_role_check
  check (fork_role is null or fork_role in ('branch', 'merge'));

create index if not exists idx_metal_work_items_fork_group
  on public.metal_work_items(fork_group_id, fork_role, status);

-- ---------------------------------------------------------------------------
-- Graph helpers (jsonb process_graph → fork plan)
-- ---------------------------------------------------------------------------

create or replace function public.metal_graph_node_stage(p_graph jsonb, p_node_id text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(n.value->>'stage', '')))
  from jsonb_array_elements(coalesce(p_graph->'nodes', '[]'::jsonb)) n(value)
  where n.value->>'id' = p_node_id
    and lower(coalesce(n.value->>'kind', '')) = 'stage'
  limit 1;
$$;

create or replace function public.metal_graph_is_merge_node(p_graph jsonb, p_node_id text)
returns boolean
language sql
immutable
as $$
  with stage_nodes as (
    select n.value->>'id' as id
    from jsonb_array_elements(coalesce(p_graph->'nodes', '[]'::jsonb)) n(value)
    where lower(coalesce(n.value->>'kind', '')) = 'stage'
  )
  select count(*) >= 2
  from jsonb_array_elements(coalesce(p_graph->'edges', '[]'::jsonb)) e(value)
  join stage_nodes s on s.id = e.value->>'from'
  where e.value->>'to' = p_node_id;
$$;

create or replace function public.metal_graph_start_stage_nodes(p_graph jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_start_id text := 'start';
  v_nodes jsonb := coalesce(p_graph->'nodes', '[]'::jsonb);
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_rec record;
  v_out text[] := array[]::text[];
begin
  for v_rec in select n.value as node from jsonb_array_elements(v_nodes) n(value) loop
    if lower(coalesce(v_rec.node->>'kind', '')) = 'start' then
      v_start_id := coalesce(v_rec.node->>'id', 'start');
      exit;
    end if;
  end loop;

  for v_rec in
    select e.value->>'to' as node_id
    from jsonb_array_elements(v_edges) e(value)
    where e.value->>'from' = v_start_id
  loop
    if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
      v_out := array_append(v_out, v_rec.node_id);
    end if;
  end loop;

  return v_out;
end;
$$;

create or replace function public.metal_graph_walk_branch(
  p_graph jsonb,
  p_start_node_id text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_cur text := p_start_node_id;
  v_next text;
  v_route text[] := array[]::text[];
  v_stage text;
  v_merge_stage text := null;
  v_outs text[];
  v_rec record;
  v_guard integer := 0;
begin
  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    v_stage := public.metal_graph_node_stage(p_graph, v_cur);
    if v_stage = '' then
      exit;
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_cur) and array_length(v_route, 1) is not null then
      v_merge_stage := v_stage;
      exit;
    end if;

    v_route := array_append(v_route, v_stage);

    if public.metal_graph_is_merge_node(p_graph, v_cur) then
      v_route := v_route[1:array_length(v_route, 1) - 1];
      v_merge_stage := v_stage;
      exit;
    end if;

    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) = 0 then
      exit;
    end if;

    v_next := v_outs[1];
    if coalesce(array_length(v_outs, 1), 0) > 1 then
      select min(x) into v_next from unnest(v_outs) x;
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_next) then
      v_merge_stage := public.metal_graph_node_stage(p_graph, v_next);
      exit;
    end if;

    v_cur := v_next;
  end loop;

  return jsonb_build_object(
    'route', to_jsonb(coalesce(v_route, array[]::text[])),
    'merge_stage', v_merge_stage
  );
end;
$$;

create or replace function public.metal_graph_after_merge_route(
  p_graph jsonb,
  p_merge_stage text
)
returns text[]
language plpgsql
immutable
as $$
declare
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_nodes jsonb := coalesce(p_graph->'nodes', '[]'::jsonb);
  v_cur text := null;
  v_next text;
  v_route text[] := array[]::text[];
  v_rec record;
  v_outs text[];
  v_guard integer := 0;
begin
  for v_rec in select n.value as node from jsonb_array_elements(v_nodes) n(value) loop
    if lower(coalesce(v_rec.node->>'kind', '')) = 'stage'
       and lower(trim(coalesce(v_rec.node->>'stage', ''))) = lower(trim(p_merge_stage)) then
      v_cur := v_rec.node->>'id';
      exit;
    end if;
  end loop;

  if v_cur is null then
    return array[]::text[];
  end if;

  v_route := array_append(v_route, lower(trim(p_merge_stage)));

  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) <> 1 then
      exit;
    end if;

    v_next := v_outs[1];
    v_route := array_append(v_route, public.metal_graph_node_stage(p_graph, v_next));
    v_cur := v_next;
  end loop;

  return v_route;
end;
$$;

create or replace function public.metal_graph_linear_route(p_graph jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_starts text[];
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_cur text;
  v_next text;
  v_route text[] := array[]::text[];
  v_outs text[];
  v_rec record;
  v_guard integer := 0;
begin
  v_starts := public.metal_graph_start_stage_nodes(p_graph);
  if coalesce(array_length(v_starts, 1), 0) < 1 then
    return array['laser', 'bending', 'welding', 'painting'];
  end if;

  v_cur := v_starts[1];
  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    if public.metal_graph_node_stage(p_graph, v_cur) = '' then
      exit;
    end if;
    v_route := array_append(v_route, public.metal_graph_node_stage(p_graph, v_cur));

    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) <> 1 then
      exit;
    end if;
    v_next := v_outs[1];
    v_cur := v_next;
  end loop;

  if coalesce(array_length(v_route, 1), 0) < 1 then
    return array['laser', 'bending', 'welding', 'painting'];
  end if;
  return v_route;
end;
$$;

create or replace function public.metal_extract_fork_plan(p_graph jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_starts text[];
  v_start_id text;
  v_branch jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_merge_stage text;
  v_merge_stages text[] := array[]::text[];
  v_route text[];
  v_i integer;
  v_merge_route text[];
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  v_starts := public.metal_graph_start_stage_nodes(p_graph);
  if coalesce(array_length(v_starts, 1), 0) <= 1 then
    return jsonb_build_object(
      'mode', 'linear',
      'route', to_jsonb(public.metal_graph_linear_route(p_graph))
    );
  end if;

  for v_i in 1..coalesce(array_length(v_starts, 1), 0) loop
    v_start_id := v_starts[v_i];
    v_branch := public.metal_graph_walk_branch(p_graph, v_start_id);
    v_branches := v_branches || jsonb_build_array(
      jsonb_build_object(
        'branch_key', coalesce((v_branch->'route'->>0), public.metal_graph_node_stage(p_graph, v_start_id)),
        'route', coalesce(v_branch->'route', '[]'::jsonb),
        'merge_stage', v_branch->>'merge_stage'
      )
    );
    if nullif(trim(coalesce(v_branch->>'merge_stage', '')), '') is not null then
      v_merge_stages := array_append(v_merge_stages, v_branch->>'merge_stage');
    end if;
  end loop;

  select m.stage into v_merge_stage
  from (select distinct unnest(v_merge_stages) as stage) m
  limit 1;

  if (select count(distinct stage) from unnest(v_merge_stages) stage) <> 1 or v_merge_stage is null then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  v_merge_route := public.metal_graph_after_merge_route(p_graph, v_merge_stage);
  if coalesce(array_length(v_merge_route, 1), 0) < 1 then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  return jsonb_build_object(
    'mode', 'parallel',
    'branches', v_branches,
    'merge_stage', v_merge_stage,
    'merge_route', to_jsonb(v_merge_route)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Spawn merge item when all branches are done
-- ---------------------------------------------------------------------------

create or replace function public.metal_try_spawn_merge_item(p_fork_group_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_parent public.metal_work_items%rowtype;
  v_open_branches integer;
  v_existing_merge integer;
  v_merge_route text[];
  v_new_id bigint;
begin
  if p_fork_group_id is null then
    return null;
  end if;

  select count(*) into v_existing_merge
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'merge';

  if v_existing_merge > 0 then
    return null;
  end if;

  select count(*) into v_open_branches
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'branch'
    and mwi.status <> 'done';

  if v_open_branches > 0 then
    return null;
  end if;

  select * into v_parent
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.status = 'split'
  order by mwi.id
  limit 1;

  if v_parent.id is null then
    return null;
  end if;

  select array_agg(x order by ord)
  into v_merge_route
  from (
    select value::text as x, ordinality as ord
    from jsonb_array_elements_text(coalesce(v_parent.fork_meta->'merge_route', '[]'::jsonb)) with ordinality
  ) t;

  if coalesce(array_length(v_merge_route, 1), 0) < 1 then
    return null;
  end if;

  insert into public.metal_work_items(
    article, name, week, qty,
    stage_route, route_idx, stage_done_qty,
    current_stage, stage_status, status,
    process_graph, fork_group_id, fork_role, parent_id, fork_meta,
    operator_comment
  )
  values (
    v_parent.article,
    v_parent.name,
    v_parent.week,
    v_parent.qty,
    v_merge_route,
    0,
    0,
    v_merge_route[1],
    'queued',
    'active',
    v_parent.process_graph,
    p_fork_group_id,
    'merge',
    v_parent.id,
    v_parent.fork_meta,
    v_parent.operator_comment
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fork planned item into parallel branches
-- ---------------------------------------------------------------------------

create or replace function public.metal_fork_planned_item(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item public.metal_work_items%rowtype;
  v_graph jsonb;
  v_plan jsonb;
  v_fork_group uuid := gen_random_uuid();
  v_branch jsonb;
  v_route text[];
  v_i integer;
begin
  select * into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'work item not found';
  end if;
  if v_item.status <> 'planned' then
    raise exception 'only planned items can be forked';
  end if;

  v_graph := v_item.process_graph;
  if v_graph is null then
    select coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route))
    into v_graph
    from public.metal_product_catalog c
    where c.article = v_item.article;
  end if;

  v_plan := public.metal_extract_fork_plan(v_graph);
  if coalesce(v_plan->>'mode', '') <> 'parallel' then
    raise exception 'item graph is not parallel';
  end if;

  update public.metal_work_items mwi
  set
    status = 'split',
    fork_group_id = v_fork_group,
    fork_meta = jsonb_build_object(
      'merge_stage', v_plan->>'merge_stage',
      'merge_route', coalesce(v_plan->'merge_route', '[]'::jsonb)
    ),
    process_graph = v_graph,
    updated_at = now()
  where mwi.id = v_item.id;

  for v_i in 0..(jsonb_array_length(v_plan->'branches') - 1) loop
    v_branch := v_plan->'branches'->v_i;
    select array_agg(x order by ord)
    into v_route
    from (
      select value::text as x, ordinality as ord
      from jsonb_array_elements_text(coalesce(v_branch->'route', '[]'::jsonb)) with ordinality
    ) t;

    if coalesce(array_length(v_route, 1), 0) < 1 then
      continue;
    end if;

    insert into public.metal_work_items(
      article, name, week, qty,
      stage_route, route_idx, stage_done_qty,
      current_stage, stage_status, status,
      process_graph, fork_group_id, fork_role, parent_id, fork_meta,
      operator_comment
    )
    values (
      v_item.article,
      v_item.name,
      v_item.week,
      v_item.qty,
      v_route,
      0,
      0,
      v_route[1],
      'queued',
      'active',
      v_graph,
      v_fork_group,
      'branch',
      v_item.id,
      jsonb_build_object(
        'branch_key', coalesce(v_branch->>'branch_key', v_route[1]),
        'merge_stage', v_plan->>'merge_stage'
      ),
      v_item.operator_comment
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- create: snapshot process_graph from catalog
-- ---------------------------------------------------------------------------

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
  on conflict on constraint metal_product_catalog_pkey do update
    set name = excluded.name, is_active = true, updated_at = now();

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
    mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
    mwi.current_stage, mwi.stage_status, mwi.status,
    mwi.created_at, mwi.updated_at
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

-- ---------------------------------------------------------------------------
-- transition: fork on start, merge after branch done
-- ---------------------------------------------------------------------------

create or replace function public.web_transition_metal_stage(
  p_item_id bigint,
  p_action text,
  p_start_stage text default null,
  p_done_qty numeric default null,
  p_note text default null
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
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_item public.metal_work_items%rowtype;
  v_start_stage text := lower(trim(coalesce(p_start_stage, '')));
  v_emit_event boolean := true;
  v_route text[];
  v_idx integer;
  v_next_stage text;
  v_remaining numeric;
  v_done numeric;
  v_graph jsonb;
  v_plan jsonb;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_action not in ('start', 'pause', 'resume', 'done') then
    raise exception 'unsupported action';
  end if;

  select mwi.* into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id
  for update;

  if v_item.id is null then raise exception 'work item not found'; end if;
  if v_item.status in ('done', 'cancelled', 'split') then
    raise exception 'work item already completed or split';
  end if;

  v_route := coalesce(v_item.stage_route, array['laser', 'bending', 'welding', 'painting']);
  if array_length(v_route, 1) is null or array_length(v_route, 1) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  v_idx := greatest(0, coalesce(v_item.route_idx, 0));

  if v_action = 'start' then
    if v_item.stage_status <> 'queued' then
      raise exception 'stage must be queued for start';
    end if;

    if v_item.status = 'planned' then
      v_graph := v_item.process_graph;
      if v_graph is null then
        select coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route))
        into v_graph
        from public.metal_product_catalog c
        where c.article = v_item.article;
      end if;
      v_plan := public.metal_extract_fork_plan(v_graph);

      if coalesce(v_plan->>'mode', '') = 'parallel' then
        perform public.metal_fork_planned_item(v_item.id);
        v_emit_event := false;
        return query
        select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
               mwi.current_stage, mwi.stage_status, mwi.status,
               mwi.created_at, mwi.updated_at
        from public.metal_work_items mwi
        where mwi.id = v_item.id;
        return;
      end if;

      if v_start_stage = '' then
        v_start_stage := lower(trim(coalesce(v_route[v_idx + 1], v_item.current_stage)));
      end if;

      select coalesce(
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage and i - 1 >= v_idx),
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage),
        0
      ) into v_idx;

      update public.metal_work_items mwi
      set status = 'active', route_idx = v_idx,
          current_stage = lower(trim(coalesce(v_route[v_idx + 1], v_start_stage))),
          stage_status = 'queued', stage_done_qty = 0,
          current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
      v_emit_event := false;
    else
      update public.metal_work_items mwi
      set status = 'active', stage_status = 'in_progress',
          current_stage_started_at = now(), updated_at = now()
      where mwi.id = v_item.id;
    end if;

  elsif v_action = 'pause' then
    if v_item.stage_status <> 'in_progress' then raise exception 'stage must be in_progress for pause'; end if;
    update public.metal_work_items mwi set stage_status = 'paused', updated_at = now() where mwi.id = v_item.id;

  elsif v_action = 'resume' then
    if v_item.stage_status <> 'paused' then raise exception 'stage must be paused for resume'; end if;
    update public.metal_work_items mwi set stage_status = 'in_progress', updated_at = now() where mwi.id = v_item.id;

  else
    if v_item.stage_status not in ('in_progress', 'paused') then
      raise exception 'stage must be in_progress or paused for done';
    end if;

    v_remaining := greatest(0, v_item.qty - coalesce(v_item.stage_done_qty, 0));
    v_done := coalesce(p_done_qty, v_remaining);
    if v_done < 0 or v_done > v_remaining then
      raise exception 'done_qty must be between 0 and remaining qty';
    end if;

    update public.metal_work_items mwi
    set stage_done_qty = least(mwi.qty, mwi.stage_done_qty + v_done), updated_at = now()
    where mwi.id = v_item.id;

    select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;

    if v_item.stage_done_qty < v_item.qty then
      update public.metal_work_items mwi
      set stage_status = 'paused', current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
    else
      v_idx := coalesce(v_item.route_idx, v_idx);
      if v_idx >= array_length(v_route, 1) - 1 then
        v_next_stage := null;
      else
        v_next_stage := lower(trim(coalesce(v_route[v_idx + 2], '')));
      end if;

      if v_next_stage is null or v_next_stage = '' then
        update public.metal_work_items mwi
        set stage_status = 'done', status = 'done', current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
      else
        update public.metal_work_items mwi
        set route_idx = v_idx + 1, current_stage = v_next_stage,
            stage_status = 'queued', stage_done_qty = 0,
            current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
      end if;

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;

      if v_item.fork_role = 'branch' and v_item.status = 'done' then
        perform public.metal_try_spawn_merge_item(v_item.fork_group_id);
      end if;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(work_item_id, stage, action, note)
    values (v_item.id, v_item.current_stage, v_action, nullif(trim(coalesce(p_note, '')), ''));
  end if;

  return query
  select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
         mwi.current_stage, mwi.stage_status, mwi.status,
         mwi.created_at, mwi.updated_at
  from public.metal_work_items mwi
  where mwi.id = v_item.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list: include fork fields + operator_comment
-- ---------------------------------------------------------------------------

drop function if exists public.web_list_metal_work_items(text);

create or replace function public.web_list_metal_work_items(
  p_status text default null
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
  operator_comment text,
  created_at timestamptz,
  updated_at timestamptz,
  stage_route text[],
  route_idx integer,
  stage_done_qty numeric,
  process_graph jsonb,
  fork_group_id uuid,
  fork_role text,
  parent_id bigint,
  fork_meta jsonb,
  laser_seconds bigint,
  saw_seconds bigint,
  bending_seconds bigint,
  welding_seconds bigint,
  painting_seconds bigint
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with ev as (
    select
      e.work_item_id,
      e.stage,
      e.action,
      e.event_at,
      lead(e.event_at) over (partition by e.work_item_id order by e.event_at) as next_event_at
    from public.metal_stage_events e
  ),
  agg as (
    select
      e.work_item_id,
      sum(case when e.stage = 'laser' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as laser_seconds,
      sum(case when e.stage = 'saw' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as saw_seconds,
      sum(case when e.stage = 'bending' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as bending_seconds,
      sum(case when e.stage = 'welding' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as welding_seconds,
      sum(case when e.stage = 'painting' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as painting_seconds
    from ev e
    group by e.work_item_id
  )
  select
    i.id, i.article, i.name, i.week, i.qty,
    i.current_stage, i.stage_status, i.status,
    coalesce(i.operator_comment, '') as operator_comment,
    i.created_at, i.updated_at,
    i.stage_route, i.route_idx, i.stage_done_qty,
    i.process_graph, i.fork_group_id, i.fork_role, i.parent_id, i.fork_meta,
    coalesce(a.laser_seconds, 0), coalesce(a.saw_seconds, 0), coalesce(a.bending_seconds, 0),
    coalesce(a.welding_seconds, 0), coalesce(a.painting_seconds, 0)
  from public.metal_work_items i
  left join agg a on a.work_item_id = i.id
  where p_status is null or i.status = p_status
  order by case i.status when 'planned' then 0 when 'active' then 1 when 'split' then 2 when 'done' then 3 else 4 end,
           i.created_at desc;
$$;

grant execute on function public.web_create_metal_work_item(text, text, text, numeric) to anon, authenticated, service_role;
grant execute on function public.web_transition_metal_stage(bigint, text, text, numeric, text) to anon, authenticated, service_role;
grant execute on function public.web_list_metal_work_items(text) to anon, authenticated, service_role;
