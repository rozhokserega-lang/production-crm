-- Plan dispatch should not auto-start stage work.
-- From plan: choose route (laser/saw) -> move to production queue (queued).
-- Operator starts actual work later from Production.

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
  v_emit_event boolean := true;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_action not in ('start', 'pause', 'resume', 'done') then
    raise exception 'unsupported action';
  end if;

  select mwi.*
  into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id
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
      update public.metal_work_items mwi
      set
        status = 'active',
        current_stage = v_start_stage,
        stage_status = 'queued',
        current_stage_started_at = null,
        updated_at = now()
      where mwi.id = v_item.id;
      v_item.current_stage := v_start_stage;
      v_emit_event := false;
    else
      update public.metal_work_items mwi
      set
        status = 'active',
        stage_status = 'in_progress',
        current_stage_started_at = now(),
        updated_at = now()
      where mwi.id = v_item.id;
      v_emit_event := true;
    end if;

  elsif v_action = 'pause' then
    if v_item.stage_status <> 'in_progress' then
      raise exception 'stage must be in_progress for pause';
    end if;
    update public.metal_work_items mwi
    set stage_status = 'paused', updated_at = now()
    where mwi.id = v_item.id;

  elsif v_action = 'resume' then
    if v_item.stage_status <> 'paused' then
      raise exception 'stage must be paused for resume';
    end if;
    update public.metal_work_items mwi
    set stage_status = 'in_progress', updated_at = now()
    where mwi.id = v_item.id;

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
      update public.metal_work_items mwi
      set stage_status = 'done', status = 'done', current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
    else
      update public.metal_work_items mwi
      set current_stage = v_next_stage, stage_status = 'queued', current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(work_item_id, stage, action)
    values (v_item.id, v_item.current_stage, v_action);
  end if;

  perform public.web_audit_log_event(
    'transition_metal_stage',
    'metal_work_items',
    v_item.id::text,
    jsonb_build_object('stage', v_item.current_stage, 'action', v_action, 'start_stage', nullif(v_start_stage, ''), 'queued_dispatch_only', not v_emit_event)
  );

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
  where mwi.id = v_item.id;
end;
$$;
