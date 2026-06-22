-- Runtime для сложных маршрутов: несколько точек слияния (напр. 2 сварки → покраска).

-- ---------------------------------------------------------------------------
-- Walk branch route to a specific merge node (not just the first merge).
-- ---------------------------------------------------------------------------

create or replace function public.metal_graph_walk_branch_to(
  p_graph jsonb,
  p_start_node_id text,
  p_target_merge_node_id text
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

    if v_cur = p_target_merge_node_id then
      return jsonb_build_object(
        'route', to_jsonb(coalesce(v_route, array[]::text[])),
        'merge_stage', v_stage,
        'merge_node_id', p_target_merge_node_id
      );
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_cur) then
      exit;
    end if;

    v_route := array_append(v_route, v_stage);

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

    if coalesce(array_length(v_outs, 1), 0) > 1 then
      select min(x) into v_next from unnest(v_outs) x;
    else
      v_next := v_outs[1];
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_next) and v_next <> p_target_merge_node_id then
      exit;
    end if;

    v_cur := v_next;
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extract multi-merge plan (mirrors fronted extractMultiMergePlan).
-- ---------------------------------------------------------------------------

create or replace function public.metal_extract_multi_merge_plan(p_graph jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_nodes jsonb := coalesce(p_graph->'nodes', '[]'::jsonb);
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_starts text[];
  v_start_id text;
  v_merge_nodes jsonb := '[]'::jsonb;
  v_sub_merges jsonb := '[]'::jsonb;
  v_final_gates jsonb := '[]'::jsonb;
  v_sub_fork jsonb;
  v_branches jsonb;
  v_branch jsonb;
  v_rec record;
  v_edge record;
  v_node_id text;
  v_preds text[];
  v_is_sub boolean;
  v_is_final boolean;
  v_i integer;
  v_j integer;
  v_walk jsonb;
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    return null;
  end if;

  for v_rec in
    select n.value as node
    from jsonb_array_elements(v_nodes) n(value)
    where lower(coalesce(n.value->>'kind', '')) = 'stage'
  loop
    v_node_id := v_rec.node->>'id';
    if public.metal_graph_is_merge_node(p_graph, v_node_id) then
      v_merge_nodes := v_merge_nodes || jsonb_build_array(v_rec.node);
    end if;
  end loop;

  if jsonb_array_length(v_merge_nodes) <= 1 then
    return null;
  end if;

  for v_i in 0..(jsonb_array_length(v_merge_nodes) - 1) loop
    v_preds := array[]::text[];
    for v_edge in
      select e.value as edge
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'to' = (v_merge_nodes->v_i->>'id')
    loop
      if public.metal_graph_node_stage(p_graph, v_edge.edge->>'from') <> '' then
        v_preds := array_append(v_preds, v_edge.edge->>'from');
      end if;
    end loop;

    v_is_sub := false;
    v_is_final := false;
    if coalesce(array_length(v_preds, 1), 0) >= 2 then
      v_is_final := not exists (
        select 1 from unnest(v_preds) p(id)
        where not public.metal_graph_is_merge_node(p_graph, p.id)
      );
      v_is_sub := not v_is_final;
    elsif coalesce(array_length(v_preds, 1), 0) >= 1 then
      v_is_sub := exists (
        select 1 from unnest(v_preds) p(id)
        where not public.metal_graph_is_merge_node(p_graph, p.id)
      );
    end if;

    if v_is_sub then
      v_sub_merges := v_sub_merges || jsonb_build_array(v_merge_nodes->v_i);
    elsif v_is_final then
      v_final_gates := v_final_gates || jsonb_build_array(v_merge_nodes->v_i);
    end if;
  end loop;

  if jsonb_array_length(v_sub_merges) < 2 then
    return null;
  end if;

  v_starts := public.metal_graph_start_stage_nodes(p_graph);

  for v_i in 0..(jsonb_array_length(v_sub_merges) - 1) loop
    v_branches := '[]'::jsonb;
    for v_j in 1..coalesce(array_length(v_starts, 1), 0) loop
      v_start_id := v_starts[v_j];
      v_walk := public.metal_graph_walk_branch_to(
        p_graph,
        v_start_id,
        v_sub_merges->v_i->>'id'
      );
      if v_walk is null or coalesce(jsonb_array_length(v_walk->'route'), 0) < 1 then
        continue;
      end if;
      v_branches := v_branches || jsonb_build_array(
        jsonb_build_object(
          'branch_key', coalesce(v_walk->'route'->>0, public.metal_graph_node_stage(p_graph, v_start_id)),
          'start_node_id', v_start_id,
          'route', v_walk->'route',
          'merge_node_id', v_sub_merges->v_i->>'id'
        )
      );
    end loop;

    if jsonb_array_length(v_branches) < 1 then
      return null;
    end if;

    v_sub_fork := jsonb_build_object(
      'merge_node_id', v_sub_merges->v_i->>'id',
      'merge_stage', lower(trim(coalesce(v_sub_merges->v_i->>'stage', ''))),
      'merge_route', jsonb_build_array(lower(trim(coalesce(v_sub_merges->v_i->>'stage', '')))),
      'branches', v_branches
    );
    v_sub_merges := jsonb_set(v_sub_merges, array[v_i::text], v_sub_fork);
  end loop;

  return jsonb_build_object(
    'mode', 'multi_merge',
    'sub_forks', v_sub_merges,
    'final_gate', case
      when jsonb_array_length(v_final_gates) > 0 then
        jsonb_build_object(
          'node_id', v_final_gates->0->>'id',
          'stage', lower(trim(coalesce(v_final_gates->0->>'stage', ''))),
          'merge_route', jsonb_build_array(lower(trim(coalesce(v_final_gates->0->>'stage', '')))),
          'requires_merge_node_ids', (
            select coalesce(jsonb_agg(e.value->>'from'), '[]'::jsonb)
            from jsonb_array_elements(v_edges) e(value)
            where e.value->>'to' = (v_final_gates->0->>'id')
              and public.metal_graph_is_merge_node(p_graph, e.value->>'from')
          )
        )
      else null
    end
  );
end;
$$;

create or replace function public.metal_analyze_runtime_plan(p_graph jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_multi jsonb;
begin
  v_multi := public.metal_extract_multi_merge_plan(p_graph);
  if v_multi is not null then
    return v_multi;
  end if;
  return public.metal_extract_fork_plan(p_graph);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fork planned item into multi-merge sub-groups.
-- ---------------------------------------------------------------------------

create or replace function public.metal_fork_planned_item_multi_merge(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item public.metal_work_items%rowtype;
  v_graph jsonb;
  v_plan jsonb;
  v_root_group uuid := gen_random_uuid();
  v_sub_fork jsonb;
  v_sub_group uuid;
  v_branch jsonb;
  v_route text[];
  v_sub_groups jsonb := '{}'::jsonb;
  v_i integer;
  v_j integer;
  v_merge_node_id text;
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

  v_plan := public.metal_extract_multi_merge_plan(v_graph);
  if coalesce(v_plan->>'mode', '') <> 'multi_merge' then
    raise exception 'item graph is not multi_merge';
  end if;

  for v_i in 0..(jsonb_array_length(v_plan->'sub_forks') - 1) loop
    v_sub_fork := v_plan->'sub_forks'->v_i;
    v_sub_group := gen_random_uuid();
    v_merge_node_id := v_sub_fork->>'merge_node_id';
    v_sub_groups := v_sub_groups || jsonb_build_object(
      v_merge_node_id,
      jsonb_build_object(
        'fork_group_id', v_sub_group::text,
        'merge_node_id', v_merge_node_id,
        'merge_stage', v_sub_fork->>'merge_stage',
        'merge_route', coalesce(v_sub_fork->'merge_route', '[]'::jsonb)
      )
    );

    for v_j in 0..(jsonb_array_length(v_sub_fork->'branches') - 1) loop
      v_branch := v_sub_fork->'branches'->v_j;
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
        operator_comment, shortfall_qty
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
        v_sub_group,
        'branch',
        v_item.id,
        jsonb_build_object(
          'branch_key', coalesce(v_branch->>'branch_key', v_route[1]),
          'merge_stage', v_sub_fork->>'merge_stage',
          'merge_node_id', v_merge_node_id,
          'sub_group_id', v_merge_node_id,
          'root_parent_id', v_item.id,
          'root_fork_group_id', v_root_group::text,
          'mode', 'multi_merge'
        ),
        v_item.operator_comment,
        v_item.shortfall_qty
      );
    end loop;
  end loop;

  update public.metal_work_items mwi
  set
    status = 'split',
    fork_group_id = v_root_group,
    fork_meta = jsonb_build_object(
      'mode', 'multi_merge',
      'sub_groups', v_sub_groups,
      'final_gate', coalesce(v_plan->'final_gate', 'null'::jsonb)
    ),
    process_graph = v_graph,
    updated_at = now()
  where mwi.id = v_item.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spawn final gate (e.g. painting) after all sub-merges complete.
-- ---------------------------------------------------------------------------

create or replace function public.metal_try_spawn_final_gate_item(p_root_parent_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_parent public.metal_work_items%rowtype;
  v_sub_groups jsonb;
  v_sub_key text;
  v_sub jsonb;
  v_sub_group_id uuid;
  v_open_sub_merges integer;
  v_existing_final integer;
  v_final_route text[];
  v_final_qty numeric;
  v_new_id bigint;
begin
  if p_root_parent_id is null then
    return null;
  end if;

  select * into v_parent
  from public.metal_work_items mwi
  where mwi.id = p_root_parent_id
  for update;

  if v_parent.id is null or coalesce(v_parent.fork_meta->>'mode', '') <> 'multi_merge' then
    return null;
  end if;

  select count(*) into v_existing_final
  from public.metal_work_items mwi
  where mwi.parent_id = p_root_parent_id
    and mwi.fork_role = 'merge'
    and coalesce(mwi.fork_meta->>'is_final_gate', '') = 'true';

  if v_existing_final > 0 then
    return null;
  end if;

  v_sub_groups := coalesce(v_parent.fork_meta->'sub_groups', '{}'::jsonb);

  for v_sub_key, v_sub in
    select key, value from jsonb_each(v_sub_groups)
  loop
    v_sub_group_id := (v_sub->>'fork_group_id')::uuid;
    select count(*) into v_open_sub_merges
    from public.metal_work_items mwi
    where mwi.fork_group_id = v_sub_group_id
      and mwi.fork_role = 'merge'
      and mwi.status = 'done';

    if v_open_sub_merges < 1 then
      return null;
    end if;
  end loop;

  select array_agg(x order by ord)
  into v_final_route
  from (
    select value::text as x, ordinality as ord
    from jsonb_array_elements_text(
      coalesce(v_parent.fork_meta->'final_gate'->'merge_route', '[]'::jsonb)
    ) with ordinality
  ) t;

  if coalesce(array_length(v_final_route, 1), 0) < 1 then
    return null;
  end if;

  select min(mwi.qty) into v_final_qty
  from public.metal_work_items mwi
  where mwi.parent_id = p_root_parent_id
    and mwi.fork_role = 'merge'
    and coalesce(mwi.fork_meta->>'is_sub_merge', '') = 'true';

  v_final_qty := coalesce(v_final_qty, v_parent.qty);

  insert into public.metal_work_items(
    article, name, week, qty,
    stage_route, route_idx, stage_done_qty,
    current_stage, stage_status, status,
    process_graph, fork_group_id, fork_role, parent_id, fork_meta,
    operator_comment, shortfall_qty
  )
  values (
    v_parent.article,
    v_parent.name,
    v_parent.week,
    v_final_qty,
    v_final_route,
    0,
    0,
    v_final_route[1],
    'queued',
    'active',
    v_parent.process_graph,
    v_parent.fork_group_id,
    'merge',
    v_parent.id,
    jsonb_build_object(
      'is_final_gate', true,
      'mode', 'multi_merge',
      'merge_route', to_jsonb(v_final_route)
    ),
    v_parent.operator_comment,
    v_parent.shortfall_qty
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sub-group merge spawn (multi_merge aware).
-- ---------------------------------------------------------------------------

create or replace function public.metal_try_spawn_merge_item(p_fork_group_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_parent public.metal_work_items%rowtype;
  v_root_parent public.metal_work_items%rowtype;
  v_open_branches integer;
  v_existing_merge integer;
  v_merge_route text[];
  v_merge_qty numeric;
  v_new_id bigint;
  v_root_parent_id bigint;
  v_sub_group_id text;
  v_sub_groups jsonb;
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

  select (mwi.fork_meta->>'root_parent_id')::bigint,
         mwi.fork_meta->>'sub_group_id'
  into v_root_parent_id, v_sub_group_id
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'branch'
  order by mwi.id
  limit 1;

  if v_root_parent_id is not null then
    select * into v_root_parent
    from public.metal_work_items mwi
    where mwi.id = v_root_parent_id;

    if v_root_parent.id is null then
      return null;
    end if;

    v_sub_groups := coalesce(v_root_parent.fork_meta->'sub_groups', '{}'::jsonb);

    select array_agg(x order by ord)
    into v_merge_route
    from (
      select value::text as x, ordinality as ord
      from jsonb_array_elements_text(
        coalesce(v_sub_groups->v_sub_group_id->'merge_route', '[]'::jsonb)
      ) with ordinality
    ) t;

    select min(mwi.qty) into v_merge_qty
    from public.metal_work_items mwi
    where mwi.fork_group_id = p_fork_group_id
      and mwi.fork_role = 'branch';

    v_merge_qty := coalesce(v_merge_qty, v_root_parent.qty);

    if coalesce(array_length(v_merge_route, 1), 0) < 1 then
      return null;
    end if;

    insert into public.metal_work_items(
      article, name, week, qty,
      stage_route, route_idx, stage_done_qty,
      current_stage, stage_status, status,
      process_graph, fork_group_id, fork_role, parent_id, fork_meta,
      operator_comment, shortfall_qty
    )
    values (
      v_root_parent.article,
      v_root_parent.name,
      v_root_parent.week,
      v_merge_qty,
      v_merge_route,
      0,
      0,
      v_merge_route[1],
      'queued',
      'active',
      v_root_parent.process_graph,
      p_fork_group_id,
      'merge',
      v_root_parent.id,
      jsonb_build_object(
        'is_sub_merge', true,
        'sub_group_id', v_sub_group_id,
        'root_parent_id', v_root_parent.id,
        'root_fork_group_id', v_root_parent.fork_group_id::text,
        'mode', 'multi_merge',
        'merge_route', to_jsonb(v_merge_route)
      ),
      v_root_parent.operator_comment,
      v_root_parent.shortfall_qty
    )
    returning id into v_new_id;

    return v_new_id;
  end if;

  -- Legacy single-merge path.
  select * into v_parent
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.status = 'split'
  order by mwi.id
  limit 1;

  if v_parent.id is null then
    return null;
  end if;

  select min(mwi.qty) into v_merge_qty
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'branch';

  v_merge_qty := coalesce(v_merge_qty, v_parent.qty);

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
    operator_comment, shortfall_qty
  )
  values (
    v_parent.article,
    v_parent.name,
    v_parent.week,
    v_merge_qty,
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
    v_parent.operator_comment,
    v_parent.shortfall_qty
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transition: fork on start (parallel + multi_merge).
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
#variable_conflict use_column
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
  v_event_stage text;
  v_event_note text;
  v_event_done_qty numeric;
  v_event_qty_before numeric;
  v_event_qty_after numeric;
  v_qty_before_order numeric;
  v_new_qty numeric;
  v_shortfall numeric;
  v_stage_complete boolean := false;
  v_note text;
  v_root_parent_id bigint;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_action not in ('start', 'pause', 'resume', 'done') then
    raise exception 'unsupported action';
  end if;

  v_event_note := nullif(trim(coalesce(p_note, '')), '');

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
      v_plan := public.metal_analyze_runtime_plan(v_graph);

      if coalesce(v_plan->>'mode', '') = 'multi_merge' then
        perform public.metal_fork_planned_item_multi_merge(v_item.id);
        v_emit_event := false;
        return query
        select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
               mwi.current_stage, mwi.stage_status, mwi.status,
               mwi.created_at, mwi.updated_at
        from public.metal_work_items mwi
        where mwi.id = v_item.id;
        return;
      end if;

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

    v_event_stage := v_item.current_stage;
    v_qty_before_order := v_item.qty;
    v_remaining := greatest(0, v_item.qty - coalesce(v_item.stage_done_qty, 0));
    v_done := coalesce(p_done_qty, v_remaining);
    v_note := v_event_note;

    if v_done < 0 or v_done > v_remaining then
      raise exception 'done_qty must be between 0 and remaining qty';
    end if;

    if v_done < v_remaining and v_note is not null then
      v_new_qty := coalesce(v_item.stage_done_qty, 0) + v_done;
      v_shortfall := v_item.qty - v_new_qty;

      update public.metal_work_items mwi
      set
        qty = v_new_qty,
        stage_done_qty = v_new_qty,
        shortfall_qty = mwi.shortfall_qty + v_shortfall,
        updated_at = now()
      where mwi.id = v_item.id;

      perform public.metal_propagate_fork_qty(p_item_id, v_new_qty);

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;
      v_stage_complete := true;
    else
      update public.metal_work_items mwi
      set stage_done_qty = least(mwi.qty, mwi.stage_done_qty + v_done), updated_at = now()
      where mwi.id = v_item.id;

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;

      if v_item.stage_done_qty < v_item.qty then
        update public.metal_work_items mwi
        set stage_status = 'paused', current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
      else
        v_stage_complete := true;
      end if;
    end if;

    if v_stage_complete then
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

      if v_item.fork_role = 'merge' and v_item.status = 'done' then
        if coalesce(v_item.fork_meta->>'is_sub_merge', '') = 'true' then
          v_root_parent_id := (v_item.fork_meta->>'root_parent_id')::bigint;
          perform public.metal_try_spawn_final_gate_item(v_root_parent_id);
        elsif coalesce(v_item.fork_meta->>'is_final_gate', '') = 'true' and v_item.parent_id is not null then
          update public.metal_work_items mwi
          set status = 'done', stage_status = 'done', updated_at = now()
          where mwi.id = v_item.parent_id and mwi.status = 'split';
        elsif v_item.parent_id is not null then
          update public.metal_work_items mwi
          set status = 'done', stage_status = 'done', updated_at = now()
          where mwi.id = v_item.parent_id and mwi.status = 'split';
        end if;
      end if;
    end if;

    if v_stage_complete then
      v_event_done_qty := v_done;
      v_event_qty_before := v_qty_before_order;
      v_event_qty_after := v_item.qty;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(
      work_item_id, stage, action, note,
      shortfall_added, done_qty, qty_before, qty_after
    )
    values (
      v_item.id,
      coalesce(v_event_stage, v_item.current_stage),
      v_action,
      v_event_note,
      case when v_action = 'done' and coalesce(v_shortfall, 0) > 0 then v_shortfall else null end,
      case when v_action = 'done' then v_event_done_qty else null end,
      case when v_action = 'done' then v_event_qty_before else null end,
      case when v_action = 'done' then v_event_qty_after else null end
    );
  end if;

  return query
  select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
         mwi.current_stage, mwi.stage_status, mwi.status,
         mwi.created_at, mwi.updated_at
  from public.metal_work_items mwi
  where mwi.id = v_item.id;
end;
$$;

grant execute on function public.metal_graph_walk_branch_to(jsonb, text, text) to anon, authenticated, service_role;
grant execute on function public.metal_extract_multi_merge_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.metal_analyze_runtime_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.metal_fork_planned_item_multi_merge(bigint) to anon, authenticated, service_role;
grant execute on function public.metal_try_spawn_final_gate_item(bigint) to anon, authenticated, service_role;
grant execute on function public.metal_try_spawn_merge_item(uuid) to anon, authenticated, service_role;
grant execute on function public.web_transition_metal_stage(bigint, text, text, numeric, text) to anon, authenticated, service_role;
