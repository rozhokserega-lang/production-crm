-- Уточнение очереди загрузки цеха: исключить склад и собранные заказы.

create or replace function public.web_get_workshop_queue()
returns table (
  order_id text,
  item text,
  qty numeric,
  pipeline_stage text,
  pilka_done boolean,
  kromka_done boolean,
  pras_done boolean,
  assembly_done boolean,
  pilka_in_work boolean,
  kromka_in_work boolean,
  pras_in_work boolean,
  assembly_in_work boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    o.order_id,
    o.item,
    o.qty,
    o.pipeline_stage,
    (o.pilka_done_at is not null) as pilka_done,
    (o.kromka_done_at is not null) as kromka_done,
    (o.pras_done_at is not null) as pras_done,
    (coalesce(o.assembly_status, '') ilike '%собрано%') as assembly_done,
    (o.pilka_started_at is not null and o.pilka_done_at is null) as pilka_in_work,
    (o.kromka_started_at is not null and o.kromka_done_at is null) as kromka_in_work,
    (o.pras_started_at is not null and o.pras_done_at is null) as pras_in_work,
    (coalesce(o.assembly_status, '') ilike '%в работе%') as assembly_in_work
  from public.orders o
  where o.pipeline_stage is not null
    and o.pipeline_stage not in ('ready_to_ship', 'shipped', 'warehouse_kit', 'assembled')
    and coalesce(o.qty, 0) > 0;
$$;

grant execute on function public.web_get_workshop_queue() to anon, authenticated, service_role;
