-- Add saw stage and route branching for metal process.

alter table public.metal_work_items drop constraint if exists metal_work_items_current_stage_check;
alter table public.metal_work_items
  add constraint metal_work_items_current_stage_check
  check (current_stage in ('laser', 'saw', 'bending', 'welding', 'painting'));

alter table public.metal_stage_events drop constraint if exists metal_stage_events_stage_check;
alter table public.metal_stage_events
  add constraint metal_stage_events_stage_check
  check (stage in ('laser', 'saw', 'bending', 'welding', 'painting'));

drop function if exists public.web_transition_metal_stage(bigint, text);
drop function if exists public.web_transition_metal_stage(bigint, text, text);
drop function if exists public.web_list_metal_work_items(text);

create or replace function public.web_transition_metal_stage(
  p_item_id bigint,
  p_action text,
  p_start_stage text default null
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
  v_next_stage text;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_action not in ('start', 'pause', 'resume', 'done') then
    raise exception 'unsupported action';
  end if;

  select *
  into v_item
  from public.metal_work_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'work item not found';
  end if;
  if v_item.status in ('done', 'cancelled') then
    raise exception 'work item already completed';
  end if;

  if v_action = 'start' then
    if v_item.stage_status <> 'queued' then
      raise exception 'stage must be queued for start';
    end if;

    if v_item.status = 'planned' then
      if v_start_stage not in ('laser', 'saw') then
        raise exception 'start stage must be laser or saw for planned item';
      end if;
      update public.metal_work_items
      set
        status = 'active',
        current_stage = v_start_stage,
        stage_status = 'in_progress',
        current_stage_started_at = now(),
        updated_at = now()
      where id = v_item.id;
      v_item.current_stage := v_start_stage;
    else
      update public.metal_work_items
      set
        status = 'active',
        stage_status = 'in_progress',
        current_stage_started_at = now(),
        updated_at = now()
      where id = v_item.id;
    end if;
  elsif v_action = 'pause' then
    if v_item.stage_status <> 'in_progress' then
      raise exception 'stage must be in_progress for pause';
    end if;
    update public.metal_work_items
    set stage_status = 'paused', updated_at = now()
    where id = v_item.id;
  elsif v_action = 'resume' then
    if v_item.stage_status <> 'paused' then
      raise exception 'stage must be paused for resume';
    end if;
    update public.metal_work_items
    set stage_status = 'in_progress', updated_at = now()
    where id = v_item.id;
  else
    if v_item.stage_status not in ('in_progress', 'paused') then
      raise exception 'stage must be in_progress or paused for done';
    end if;

    if v_item.current_stage = 'laser' then
      v_next_stage := 'bending';
    elsif v_item.current_stage = 'saw' then
      v_next_stage := 'welding';
    elsif v_item.current_stage = 'bending' then
      v_next_stage := 'welding';
    elsif v_item.current_stage = 'welding' then
      v_next_stage := 'painting';
    elsif v_item.current_stage = 'painting' then
      v_next_stage := null;
    else
      raise exception 'invalid current stage';
    end if;

    if v_next_stage is null then
      update public.metal_work_items
      set stage_status = 'done', status = 'done', current_stage_started_at = null, updated_at = now()
      where id = v_item.id;
    else
      update public.metal_work_items
      set current_stage = v_next_stage, stage_status = 'queued', current_stage_started_at = null, updated_at = now()
      where id = v_item.id;
    end if;
  end if;

  insert into public.metal_stage_events(work_item_id, stage, action)
  values (v_item.id, v_item.current_stage, v_action);

  perform public.web_audit_log_event(
    'transition_metal_stage',
    'metal_work_items',
    v_item.id::text,
    jsonb_build_object('stage', v_item.current_stage, 'action', v_action, 'start_stage', nullif(v_start_stage, ''))
  );

  return query
  select i.id, i.article, i.name, i.week, i.qty, i.current_stage, i.stage_status, i.status, i.created_at, i.updated_at
  from public.metal_work_items i
  where i.id = v_item.id;
end;
$$;

grant execute on function public.web_transition_metal_stage(bigint, text, text) to anon, authenticated, service_role;

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
  created_at timestamptz,
  updated_at timestamptz,
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
      sum(case when e.stage = 'laser' and e.action in ('start', 'resume') then greatest(0, extract(epoch from (coalesce(e.next_event_at, now()) - e.event_at)))::bigint else 0 end) as laser_seconds,
      sum(case when e.stage = 'saw' and e.action in ('start', 'resume') then greatest(0, extract(epoch from (coalesce(e.next_event_at, now()) - e.event_at)))::bigint else 0 end) as saw_seconds,
      sum(case when e.stage = 'bending' and e.action in ('start', 'resume') then greatest(0, extract(epoch from (coalesce(e.next_event_at, now()) - e.event_at)))::bigint else 0 end) as bending_seconds,
      sum(case when e.stage = 'welding' and e.action in ('start', 'resume') then greatest(0, extract(epoch from (coalesce(e.next_event_at, now()) - e.event_at)))::bigint else 0 end) as welding_seconds,
      sum(case when e.stage = 'painting' and e.action in ('start', 'resume') then greatest(0, extract(epoch from (coalesce(e.next_event_at, now()) - e.event_at)))::bigint else 0 end) as painting_seconds
    from ev e
    group by e.work_item_id
  )
  select
    i.id, i.article, i.name, i.week, i.qty, i.current_stage, i.stage_status, i.status, i.created_at, i.updated_at,
    coalesce(a.laser_seconds, 0) as laser_seconds,
    coalesce(a.saw_seconds, 0) as saw_seconds,
    coalesce(a.bending_seconds, 0) as bending_seconds,
    coalesce(a.welding_seconds, 0) as welding_seconds,
    coalesce(a.painting_seconds, 0) as painting_seconds
  from public.metal_work_items i
  left join agg a on a.work_item_id = i.id
  where p_status is null or i.status = p_status
  order by case i.status when 'planned' then 0 when 'active' then 1 when 'done' then 2 else 3 end, i.created_at desc;
$$;

grant execute on function public.web_list_metal_work_items(text) to anon, authenticated, service_role;
