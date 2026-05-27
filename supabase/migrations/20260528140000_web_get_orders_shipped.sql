-- Fast stage-specific order RPCs (avoid scanning via web_get_orders_all).

create index if not exists idx_orders_pipeline_stage on public.orders (pipeline_stage);

drop function if exists public.web_get_orders_shipped();
drop function if exists public.web_get_orders_post_workshop();
drop function if exists public.web_get_orders_pilka();
drop function if exists public.web_get_orders_kromka();
drop function if exists public.web_get_orders_pras();

create or replace function public.web_get_orders_pilka()
returns table (
  order_id text,
  source_row_id text,
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
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'pilka'
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_kromka()
returns table (
  order_id text,
  source_row_id text,
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
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'kromka'
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_pras()
returns table (
  order_id text,
  source_row_id text,
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
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'pras'
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_shipped()
returns table (
  order_id text,
  source_row_id text,
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
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'shipped'
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_post_workshop()
returns table (
  order_id text,
  source_row_id text,
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
  admin_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage in ('workshop_complete', 'assembled', 'ready_to_ship')
  order by o.updated_at desc nulls last, o.order_id;
$$;

grant execute on function public.web_get_orders_pilka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_kromka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_pras() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_shipped() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_post_workshop() to anon, authenticated, service_role;
