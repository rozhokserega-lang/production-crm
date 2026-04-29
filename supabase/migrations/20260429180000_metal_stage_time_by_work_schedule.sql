create or replace function public.web_calc_working_seconds_between(
  p_start timestamptz,
  p_end timestamptz
)
returns bigint
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with bounds as (
    select
      least(p_start, p_end) as start_ts,
      greatest(p_start, p_end) as end_ts
  ),
  schedule as (
    select
      coalesce(ws.working_days, array['mon','tue','wed','thu','fri']::text[]) as working_days,
      ws.work_start::time as work_start,
      ws.work_end::time as work_end,
      ws.lunch_start::time as lunch_start,
      ws.lunch_end::time as lunch_end
    from public.web_get_work_schedule() ws
    limit 1
  ),
  days as (
    select
      gs as day_start,
      case extract(dow from gs)::int
        when 0 then 'sun'
        when 1 then 'mon'
        when 2 then 'tue'
        when 3 then 'wed'
        when 4 then 'thu'
        when 5 then 'fri'
        else 'sat'
      end as day_key
    from bounds b
    cross join lateral generate_series(
      date_trunc('day', b.start_ts),
      date_trunc('day', b.end_ts),
      interval '1 day'
    ) gs
  ),
  per_day as (
    select
      d.day_start,
      (d.day_start + s.work_start) as work_start_ts,
      (d.day_start + s.work_end) as work_end_ts,
      (d.day_start + s.lunch_start) as lunch_start_ts,
      (d.day_start + s.lunch_end) as lunch_end_ts,
      d.day_key = any(s.working_days) as is_work_day
    from days d
    cross join schedule s
  ),
  day_overlaps as (
    select
      case
        when not p.is_work_day then 0::bigint
        else greatest(
          0,
          extract(epoch from least(b.end_ts, p.work_end_ts) - greatest(b.start_ts, p.work_start_ts))
        )::bigint
      end as work_overlap_sec,
      case
        when not p.is_work_day then 0::bigint
        else greatest(
          0,
          extract(epoch from least(b.end_ts, p.lunch_end_ts) - greatest(b.start_ts, p.lunch_start_ts))
        )::bigint
      end as lunch_overlap_sec
    from per_day p
    cross join bounds b
  )
  select greatest(0::bigint, coalesce(sum(work_overlap_sec - lunch_overlap_sec), 0::bigint))
  from day_overlaps;
$$;

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
    i.id,
    i.article,
    i.name,
    i.week,
    i.qty,
    i.current_stage,
    i.stage_status,
    i.status,
    coalesce(i.operator_comment, '') as operator_comment,
    i.created_at,
    i.updated_at,
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

grant execute on function public.web_calc_working_seconds_between(timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.web_list_metal_work_items(text) to anon, authenticated, service_role;
