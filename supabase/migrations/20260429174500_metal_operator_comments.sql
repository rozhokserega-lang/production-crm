alter table public.metal_work_items
  add column if not exists operator_comment text not null default '';

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

grant execute on function public.web_list_metal_work_items(text) to anon, authenticated, service_role;

create or replace function public.web_set_metal_work_item_comment(
  p_item_id bigint,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_id bigint;
  v_comment text := left(trim(coalesce(p_comment, '')), 2000);
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if coalesce(p_item_id, 0) <= 0 then
    raise exception 'invalid item id';
  end if;

  update public.metal_work_items mwi
  set operator_comment = v_comment, updated_at = now()
  where mwi.id = p_item_id
  returning mwi.id into v_id;

  if v_id is null then
    raise exception 'work item not found';
  end if;

  perform public.web_audit_log_event(
    'set_metal_work_item_comment',
    'metal_work_items',
    v_id::text,
    jsonb_build_object('comment_length', char_length(v_comment))
  );

  return true;
end;
$$;

grant execute on function public.web_set_metal_work_item_comment(bigint, text) to anon, authenticated, service_role;
