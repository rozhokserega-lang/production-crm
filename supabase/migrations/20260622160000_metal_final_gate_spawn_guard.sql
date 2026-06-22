-- Финал (покраска) только после done sub_merge во всех sub_groups.

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
  v_open_branches integer;
  v_done_sub_merges integer;
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

  for v_sub_key, v_sub in select key, value from jsonb_each(v_sub_groups) loop
    v_sub_group_id := (v_sub->>'fork_group_id')::uuid;

    select count(*) into v_open_branches
    from public.metal_work_items mwi
    where mwi.fork_group_id = v_sub_group_id
      and mwi.fork_role = 'branch'
      and mwi.status <> 'done';

    if v_open_branches > 0 then
      return null;
    end if;

    select count(*) into v_done_sub_merges
    from public.metal_work_items mwi
    where mwi.fork_group_id = v_sub_group_id
      and mwi.fork_role = 'merge'
      and coalesce(mwi.fork_meta->>'is_sub_merge', '') = 'true'
      and mwi.status = 'done';

    if v_done_sub_merges < 1 then
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
    and coalesce(mwi.fork_meta->>'is_sub_merge', '') = 'true'
    and mwi.status = 'done';

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
      'merge_route', to_jsonb(v_final_route),
      'root_parent_id', v_parent.id
    ),
    v_parent.operator_comment,
    v_parent.shortfall_qty
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
