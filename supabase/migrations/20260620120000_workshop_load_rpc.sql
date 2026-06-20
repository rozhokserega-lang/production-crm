-- Дашборд загрузки цеха: RPC возвращает очередь активных заказов с флагами этапов.
-- Фронт применяет resolveLaborGroup + estimateLaborForItem (текстовый разбор item →
-- группа нормы) и суммирует минуты по этапам. Здесь — только «сырые» данные,
-- без дублирования логики группировки из JS (она сложная: regex, ё→е, размер NNN_NNN).
--
-- Логика фильтра: заказы в активной производственной очереди цеха.
-- Исключаем warehouse_kit (комплектация на складе), assembled и отгрузку —
-- см. isOrderProductionPlanComplete в orderPipeline.js.
-- Для каждого — флаги «этап пройден» и «этап в работе», по которым фронт решает,
-- считать ли норму этапа в очередь.
--   * pilka_done / kromka_done / pras_done — по *_done_at (машинные timestamps).
--   * assembly_done — по assembly_status ilike '%собрано%' (как в orderPipeline.js).
--   * *_in_work — started_at задан, done_at ещё нет (или assembly_status ilike '%в работе%').

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
