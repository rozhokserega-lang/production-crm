-- When merge row completes, close the split parent so plan does not linger.

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

      if v_item.fork_role = 'merge' and v_item.status = 'done' and v_item.parent_id is not null then
        update public.metal_work_items mwi
        set status = 'done', stage_status = 'done', updated_at = now()
        where mwi.id = v_item.parent_id and mwi.status = 'split';
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

grant execute on function public.web_transition_metal_stage(bigint, text, text, numeric, text) to anon, authenticated, service_role;

-- Backfill parents left in split after merge already completed.
update public.metal_work_items parent
set status = 'done', stage_status = 'done', updated_at = now()
from public.metal_work_items merge_item
where merge_item.fork_role = 'merge'
  and merge_item.status = 'done'
  and merge_item.parent_id = parent.id
  and parent.status = 'split';
