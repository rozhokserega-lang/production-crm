-- New metal order should start in "planned" and only move to production after manual start.

alter table public.metal_work_items drop constraint if exists metal_work_items_status_check;
alter table public.metal_work_items
  add constraint metal_work_items_status_check
  check (status in ('planned', 'active', 'done', 'cancelled'));

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
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_week text := nullif(trim(coalesce(p_week, '')), '');
  v_qty numeric := coalesce(p_qty, 0);
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;
  if v_qty <= 0 then
    raise exception 'qty must be > 0';
  end if;

  insert into public.metal_product_catalog(article, name, is_active)
  values (v_article, v_name, true)
  on conflict on constraint metal_product_catalog_pkey
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  return query
  insert into public.metal_work_items(article, name, week, qty, current_stage, stage_status, status)
  values (v_article, v_name, v_week, v_qty, 'laser', 'queued', 'planned')
  returning
    metal_work_items.id,
    metal_work_items.article,
    metal_work_items.name,
    metal_work_items.week,
    metal_work_items.qty,
    metal_work_items.current_stage,
    metal_work_items.stage_status,
    metal_work_items.status,
    metal_work_items.created_at,
    metal_work_items.updated_at;

  perform public.web_audit_log_event(
    'create_metal_work_item',
    'metal_work_items',
    currval('public.metal_work_items_id_seq')::text,
    jsonb_build_object(
      'article', v_article,
      'name', v_name,
      'week', v_week,
      'qty', v_qty,
      'status', 'planned'
    )
  );
end;
$$;

create or replace function public.web_transition_metal_stage(
  p_item_id bigint,
  p_action text
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
  v_stages text[] := array['laser', 'bending', 'welding', 'painting'];
  v_pos integer;
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
    update public.metal_work_items
    set
      status = 'active',
      stage_status = 'in_progress',
      current_stage_started_at = now(),
      updated_at = now()
    where id = v_item.id;
  elsif v_action = 'pause' then
    if v_item.stage_status <> 'in_progress' then
      raise exception 'stage must be in_progress for pause';
    end if;
    update public.metal_work_items
    set
      stage_status = 'paused',
      updated_at = now()
    where id = v_item.id;
  elsif v_action = 'resume' then
    if v_item.stage_status <> 'paused' then
      raise exception 'stage must be paused for resume';
    end if;
    update public.metal_work_items
    set
      stage_status = 'in_progress',
      updated_at = now()
    where id = v_item.id;
  else
    if v_item.stage_status not in ('in_progress', 'paused') then
      raise exception 'stage must be in_progress or paused for done';
    end if;
    v_pos := array_position(v_stages, v_item.current_stage);
    if v_pos is null then
      raise exception 'invalid current stage';
    end if;
    v_next_stage := v_stages[v_pos + 1];
    if v_next_stage is null then
      update public.metal_work_items
      set
        stage_status = 'done',
        status = 'done',
        current_stage_started_at = null,
        updated_at = now()
      where id = v_item.id;
    else
      update public.metal_work_items
      set
        current_stage = v_next_stage,
        stage_status = 'queued',
        current_stage_started_at = null,
        updated_at = now()
      where id = v_item.id;
    end if;
  end if;

  insert into public.metal_stage_events(work_item_id, stage, action)
  values (v_item.id, v_item.current_stage, v_action);

  perform public.web_audit_log_event(
    'transition_metal_stage',
    'metal_work_items',
    v_item.id::text,
    jsonb_build_object(
      'stage', v_item.current_stage,
      'action', v_action
    )
  );

  return query
  select
    i.id,
    i.article,
    i.name,
    i.week,
    i.qty,
    i.current_stage,
    i.stage_status,
    i.status,
    i.created_at,
    i.updated_at
  from public.metal_work_items i
  where i.id = v_item.id;
end;
$$;

-- Backfill: old not-started items should become planned.
update public.metal_work_items i
set status = 'planned', updated_at = now()
where coalesce(i.status, '') = 'active'
  and coalesce(i.stage_status, '') = 'queued'
  and not exists (
    select 1
    from public.metal_stage_events e
    where e.work_item_id = i.id
  );
