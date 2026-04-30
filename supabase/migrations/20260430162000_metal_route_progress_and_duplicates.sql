-- Support custom stage_route with duplicates + partial completion per stage.
-- - Snapshot catalog route into metal_work_items.stage_route
-- - Track current route position (route_idx)
-- - Track how many pieces were completed for current stage (stage_done_qty)

alter table public.metal_work_items
  add column if not exists stage_route text[] not null default array['laser', 'bending', 'welding', 'painting'];

alter table public.metal_work_items
  add column if not exists route_idx integer not null default 0;

alter table public.metal_work_items
  add column if not exists stage_done_qty numeric(12,3) not null default 0;

alter table public.metal_work_items
  drop constraint if exists metal_work_items_stage_done_qty_check;

alter table public.metal_work_items
  add constraint metal_work_items_stage_done_qty_check
  check (stage_done_qty >= 0 and stage_done_qty <= qty);

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
  v_route text[];
  v_stage text;
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
  on conflict (article)
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  select coalesce(c.stage_route, array['laser', 'bending', 'welding', 'painting'])
  into v_route
  from public.metal_product_catalog c
  where c.article = v_article;

  if array_length(v_route, 1) is null or array_length(v_route, 1) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  v_stage := lower(trim(coalesce(v_route[1], 'laser')));

  return query
  insert into public.metal_work_items(article, name, week, qty, stage_route, route_idx, stage_done_qty, current_stage, stage_status, status)
  values (v_article, v_name, v_week, v_qty, v_route, 0, 0, v_stage, 'queued', 'planned')
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
      'stage_route', v_route
    )
  );
end;
$$;

grant execute on function public.web_create_metal_work_item(text, text, text, numeric) to anon, authenticated, service_role;

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
      if v_start_stage = '' then
        -- If not provided, start from current route position.
        v_start_stage := lower(trim(coalesce(v_route[v_idx + 1], v_item.current_stage)));
      end if;

      -- Find first occurrence of start stage at/after current idx, otherwise fallback to first occurrence.
      select coalesce(
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage and i - 1 >= v_idx),
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage),
        0
      )
      into v_idx;

      update public.metal_work_items mwi
      set
        status = 'active',
        route_idx = v_idx,
        current_stage = lower(trim(coalesce(v_route[v_idx + 1], v_start_stage))),
        stage_status = 'queued',
        stage_done_qty = 0,
        current_stage_started_at = null,
        updated_at = now()
      where mwi.id = v_item.id;
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

    v_remaining := greatest(0, v_item.qty - coalesce(v_item.stage_done_qty, 0));
    v_done := coalesce(p_done_qty, v_remaining);
    if v_done < 0 or v_done > v_remaining then
      raise exception 'done_qty must be between 0 and remaining qty';
    end if;

    update public.metal_work_items mwi
    set
      stage_done_qty = least(mwi.qty, mwi.stage_done_qty + v_done),
      updated_at = now()
    where mwi.id = v_item.id;

    -- Re-read after increment.
    select mwi.*
    into v_item
    from public.metal_work_items mwi
    where mwi.id = p_item_id;

    if v_item.stage_done_qty < v_item.qty then
      -- Partial completion: keep the same stage and pause it to make it visible.
      update public.metal_work_items mwi
      set stage_status = 'paused', current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
    else
      -- Stage fully completed: advance to next stage in route, reset stage_done_qty.
      if v_idx < 0 then v_idx := 0; end if;
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
        set
          route_idx = v_idx + 1,
          current_stage = v_next_stage,
          stage_status = 'queued',
          stage_done_qty = 0,
          current_stage_started_at = null,
          updated_at = now()
        where mwi.id = v_item.id;
      end if;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(work_item_id, stage, action, note)
    values (v_item.id, v_item.current_stage, v_action, nullif(trim(coalesce(p_note, '')), ''));
  end if;

  perform public.web_audit_log_event(
    'transition_metal_stage',
    'metal_work_items',
    v_item.id::text,
    jsonb_build_object(
      'stage', v_item.current_stage,
      'action', v_action,
      'start_stage', nullif(v_start_stage, ''),
      'done_qty', p_done_qty,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'queued_dispatch_only', not v_emit_event
    )
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

grant execute on function public.web_transition_metal_stage(bigint, text, text, numeric, text) to anon, authenticated, service_role;

drop function if exists public.web_transition_metal_stage(bigint, text, text);
drop function if exists public.web_transition_metal_stage(bigint, text, text, numeric);

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
  stage_route text[],
  route_idx integer,
  stage_done_qty numeric,
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
    i.id,
    i.article,
    i.name,
    i.week,
    i.qty,
    i.current_stage,
    i.stage_status,
    i.status,
    i.created_at,
    i.updated_at,
    i.stage_route,
    i.route_idx,
    i.stage_done_qty,
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

