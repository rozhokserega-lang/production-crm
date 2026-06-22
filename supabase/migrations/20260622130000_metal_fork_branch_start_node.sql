-- Сохраняем start_node_id ветки в fork_meta для точного сопоставления пояснений к этапам.

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
  v_merge_node_id text;
  v_sub_groups jsonb := '{}'::jsonb;
  v_branch jsonb;
  v_route text[];
  v_i integer;
  v_j integer;
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
          'start_node_id', nullif(v_branch->>'start_node_id', ''),
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
