-- List stage events for the whole fork group (branches + merge + parent),
-- not only the single work_item_id shown in stats.

drop function if exists public.web_list_metal_stage_events(bigint);

create or replace function public.web_list_metal_stage_events(p_item_id bigint)
returns table(
  id bigint,
  work_item_id bigint,
  fork_role text,
  stage text,
  action text,
  note text,
  done_qty numeric,
  qty_before numeric,
  qty_after numeric,
  shortfall_added numeric,
  event_at timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with seed as (
    select mwi.id, mwi.fork_group_id
    from public.metal_work_items mwi
    where mwi.id = p_item_id
  ),
  targets as (
    select mwi.id, mwi.fork_role
    from public.metal_work_items mwi
    cross join seed s
    where mwi.id = s.id
       or (s.fork_group_id is not null and mwi.fork_group_id = s.fork_group_id)
  )
  select
    e.id,
    e.work_item_id,
    t.fork_role,
    e.stage,
    e.action,
    e.note,
    e.done_qty,
    e.qty_before,
    e.qty_after,
    e.shortfall_added,
    e.event_at
  from public.metal_stage_events e
  join targets t on t.id = e.work_item_id
  order by e.event_at asc;
$$;

grant execute on function public.web_list_metal_stage_events(bigint) to anon, authenticated, service_role;
