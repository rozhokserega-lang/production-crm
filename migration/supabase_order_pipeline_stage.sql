-- Этап заказа в Supabase: колонка + вычисление (как fronted/src/orderPipeline.js) + RPC.
-- Выполнить в SQL Editor Supabase (или supabase db push) один раз.
--
-- Требования:
--   • public.orders
--   • public.resolve_color_name(text) — как в SUPABASE_STAGE1_SCHEMA.sql (или временно замените на NULL::text в SELECT).

-- ---------------------------------------------------------------------------
-- 1. Колонка
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists pipeline_stage text not null default 'pilka';

comment on column public.orders.pipeline_stage is
  'Машинный этап: pilka|kromka|pras|workshop_complete|assembled|ready_to_ship|shipped';

-- ---------------------------------------------------------------------------
-- 2. Вычисление (логика синхронизирована с orderPipeline.js / inferPipelineStage)
-- ---------------------------------------------------------------------------
create or replace function public.compute_order_pipeline_stage(
  p_overall text,
  p_assembly text,
  p_pilka text,
  p_kromka text,
  p_pras text
)
returns text
language plpgsql
stable
as $$
declare
  o text := lower(coalesce(p_overall, ''));
  a text := lower(coalesce(p_assembly, ''));
  pk text := lower(coalesce(p_pilka, ''));
  kr text := lower(coalesce(p_kromka, ''));
  pr text := lower(coalesce(p_pras, ''));
  pk_d boolean;
  kr_d boolean;
  pr_d boolean;
begin
  if o not like '%на пилу%'
     and (o like '%отгруж%' or o like '%упаков%' or o like '%отправ%') then
    return 'shipped';
  end if;

  if o like '%готово к отправке%' then
    return 'ready_to_ship';
  end if;

  if a like '%собрано%' then
    return 'assembled';
  end if;

  pk_d := (pk like '%готов%' or pk like '%собрано%');
  kr_d := (kr like '%готов%' or kr like '%собрано%');
  pr_d := (pr like '%готов%' or pr like '%собрано%');

  if pk_d and kr_d and pr_d then
    return 'workshop_complete';
  end if;

  if pr like '%в работе%' or pr like '%пауза%' or (pk_d and kr_d and not pr_d) then
    return 'pras';
  end if;

  if kr like '%в работе%' or kr like '%пауза%' or (pk_d and not kr_d) then
    return 'kromka';
  end if;

  return 'pilka';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Триггер: обновлять pipeline_stage при изменении статусов
-- ---------------------------------------------------------------------------
create or replace function public.orders_set_pipeline_stage()
returns trigger
language plpgsql
as $$
begin
  new.pipeline_stage := public.compute_order_pipeline_stage(
    new.overall_status,
    new.assembly_status,
    new.pilka_status,
    new.kromka_status,
    new.pras_status
  );
  return new;
end;
$$;

drop trigger if exists tr_orders_pipeline_stage on public.orders;

create trigger tr_orders_pipeline_stage
  before insert or update of overall_status, assembly_status, pilka_status, kromka_status, pras_status
  on public.orders
  for each row
  execute procedure public.orders_set_pipeline_stage();

-- ---------------------------------------------------------------------------
-- 4. Бэкфилл существующих строк
-- ---------------------------------------------------------------------------
update public.orders o
set pipeline_stage = public.compute_order_pipeline_stage(
  o.overall_status,
  o.assembly_status,
  o.pilka_status,
  o.kromka_status,
  o.pras_status
);

-- ---------------------------------------------------------------------------
-- 5. Список заказов для фронта (основной RPC)
-- ---------------------------------------------------------------------------
create or replace function public.web_get_orders_all()
returns table (
  order_id text,
  item text,
  material text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  sheets_needed numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    o.created_at,
    o.updated_at
  from public.orders o
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_pilka()
returns table (
  order_id text,
  item text,
  material text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  sheets_needed numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'pilka';
$$;

create or replace function public.web_get_orders_kromka()
returns table (
  order_id text,
  item text,
  material text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  sheets_needed numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'kromka';
$$;

create or replace function public.web_get_orders_pras()
returns table (
  order_id text,
  item text,
  material text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  sheets_needed numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'pras';
$$;

-- ---------------------------------------------------------------------------
-- 6. Статистика: добавить pipeline_stage (одно определение функции)
-- ---------------------------------------------------------------------------
create or replace function public.web_get_order_stats()
returns table (
  order_id text,
  item text,
  week text,
  qty numeric,
  pilka_status text,
  kromka_status text,
  pras_status text,
  assembly_status text,
  overall_status text,
  pipeline_stage text,
  color_name text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    o.item,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    o.updated_at
  from public.orders o
  order by o.updated_at desc nulls last, o.order_id;
$$;

-- ---------------------------------------------------------------------------
-- 7. Права для PostgREST (при необходимости скорректируйте роли)
-- ---------------------------------------------------------------------------
grant execute on function public.web_get_orders_all() to authenticated, anon, service_role;
grant execute on function public.web_get_orders_pilka() to authenticated, anon, service_role;
grant execute on function public.web_get_orders_kromka() to authenticated, anon, service_role;
grant execute on function public.web_get_orders_pras() to authenticated, anon, service_role;
grant execute on function public.web_get_order_stats() to authenticated, anon, service_role;
