-- Expose product article in orders RPC payload.
-- Priority: mapped_article_code -> article_code -> source_order_id_raw (from mirror).

drop function if exists public.web_get_orders_pras();
drop function if exists public.web_get_orders_kromka();
drop function if exists public.web_get_orders_pilka();
drop function if exists public.web_get_orders_all();

create or replace function public.web_get_orders_all()
returns table (
  order_id text,
  source_row_id text,
  product_article text,
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
  with mirror_latest as (
    select distinct on (trim(coalesce(m.order_code, '')))
      trim(coalesce(m.order_code, '')) as order_code,
      nullif(trim(coalesce(m.mapped_article_code, '')), '') as mapped_article_code,
      nullif(trim(coalesce(m.article_code, '')), '') as article_code,
      nullif(trim(coalesce(m.source_order_id_raw, '')), '') as source_order_id_raw,
      m.source_synced_at,
      m.updated_at
    from public.sheet_orders_mirror m
    where trim(coalesce(m.order_code, '')) <> ''
    order by trim(coalesce(m.order_code, '')), m.source_synced_at desc nulls last, m.updated_at desc nulls last, m.id desc
  )
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    coalesce(ml.mapped_article_code, ml.article_code, ml.source_order_id_raw, '') as product_article,
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
  left join mirror_latest ml on ml.order_code = trim(coalesce(o.order_id, ''))
  order by o.updated_at desc nulls last, o.order_id;
$$;

create or replace function public.web_get_orders_pilka()
returns table (
  order_id text,
  source_row_id text,
  product_article text,
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
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'pilka';
$$;

create or replace function public.web_get_orders_kromka()
returns table (
  order_id text,
  source_row_id text,
  product_article text,
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
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'kromka';
$$;

create or replace function public.web_get_orders_pras()
returns table (
  order_id text,
  source_row_id text,
  product_article text,
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
  select * from public.web_get_orders_all() u where u.pipeline_stage = 'pras';
$$;

grant execute on function public.web_get_orders_all() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_pilka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_kromka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_pras() to anon, authenticated, service_role;
