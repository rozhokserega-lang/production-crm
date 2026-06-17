-- When operator completes a stage with less than planned qty and a reason (shortfall),
-- reduce order qty and propagate it to the next stage / fork-merge siblings.

alter table public.metal_work_items
  add column if not exists shortfall_qty numeric(12,3) not null default 0;

alter table public.metal_work_items
  drop constraint if exists metal_work_items_shortfall_qty_check;

alter table public.metal_work_items
  add constraint metal_work_items_shortfall_qty_check
  check (shortfall_qty >= 0);

alter table public.metal_stage_events
  add column if not exists shortfall_added numeric(12,3);

-- Sync reduced qty across split parent, open branches, and merge row in the same fork group.
create or replace function public.metal_propagate_fork_qty(
  p_item_id bigint,
  p_new_qty numeric
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item public.metal_work_items%rowtype;
  v_qty numeric := greatest(0, coalesce(p_new_qty, 0));
begin
  if v_qty <= 0 then
    return;
  end if;

  select mwi.* into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id;

  if v_item.id is null or v_item.fork_group_id is null then
    return;
  end if;

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.status = 'split';

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.fork_role = 'branch'
    and mwi.status <> 'done'
    and mwi.id <> v_item.id;

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.fork_role = 'merge'
    and mwi.status <> 'done';
end;
$$;

grant execute on function public.metal_propagate_fork_qty(bigint, numeric) to anon, authenticated, service_role;

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
  v_merge_qty numeric;
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

grant execute on function public.metal_try_spawn_merge_item(uuid) to anon, authenticated, service_role;

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
  v_note text;
  v_shortfall numeric := 0;
  v_new_qty numeric;
  v_stage_complete boolean := false;
  v_event_stage text;
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

    v_event_stage := v_item.current_stage;
    v_remaining := greatest(0, v_item.qty - coalesce(v_item.stage_done_qty, 0));
    v_done := coalesce(p_done_qty, v_remaining);
    v_note := nullif(trim(coalesce(p_note, '')), '');

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
        v_stage_complete := false;
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

      if v_item.fork_role = 'merge' and v_item.status = 'done' and v_item.parent_id is not null then
        update public.metal_work_items mwi
        set status = 'done', stage_status = 'done', updated_at = now()
        where mwi.id = v_item.parent_id and mwi.status = 'split';
      end if;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(work_item_id, stage, action, note, shortfall_added)
    values (
      v_item.id,
      coalesce(v_event_stage, v_item.current_stage),
      v_action,
      v_note,
      case when v_shortfall > 0 then v_shortfall else null end
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

grant execute on function public.web_transition_metal_stage(bigint, text, text, numeric, text) to anon, authenticated, service_role;

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
  shortfall_qty numeric,
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
    coalesce(i.shortfall_qty, 0) as shortfall_qty,
    i.process_graph, i.fork_group_id, i.fork_role, i.parent_id, i.fork_meta,
    coalesce(a.laser_seconds, 0), coalesce(a.saw_seconds, 0), coalesce(a.bending_seconds, 0),
    coalesce(a.welding_seconds, 0), coalesce(a.painting_seconds, 0)
  from public.metal_work_items i
  left join agg a on a.work_item_id = i.id
  where p_status is null or i.status = p_status
  order by case i.status when 'planned' then 0 when 'active' then 1 when 'split' then 2 when 'done' then 3 else 4 end,
           i.created_at desc;
$$;

grant execute on function public.web_list_metal_work_items(text) to anon, authenticated, service_role;
