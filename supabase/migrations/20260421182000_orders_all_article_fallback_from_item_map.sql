-- Ensure product_article in orders RPC uses item_article_map fallback.
-- Priority:
-- 1) mapped_article_code (sheet mirror)
-- 2) article_code (sheet mirror)
-- 3) source_order_id_raw (sheet mirror)
-- 4) item_article_map.article (by normalized item/material match)

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
    coalesce(
      ml.mapped_article_code,
      ml.article_code,
      ml.source_order_id_raw,
      iam_match.article,
      ''
    ) as product_article,
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
  left join lateral (
    select nullif(trim(coalesce(iam.article, '')), '') as article
    from public.item_article_map iam
    where nullif(trim(coalesce(iam.article, '')), '') is not null
      and (
        public.web_norm_item_key(iam.item_name) = public.web_norm_item_key(o.item)
        or public.web_norm_item_key(o.item) like ('%' || public.web_norm_item_key(iam.item_name) || '%')
      )
    order by
      case when public.web_norm_item_key(iam.item_name) = public.web_norm_item_key(o.item) then 0 else 1 end,
      case
        when nullif(trim(coalesce(iam.table_color, '')), '') is null then 1
        when public.web_norm_item_key(iam.table_color) = public.web_norm_item_key(o.material) then 0
        when public.web_norm_item_key(o.item) like ('%' || public.web_norm_item_key(iam.table_color) || '%') then 1
        else 2
      end,
      coalesce(iam.sort_order, 999),
      iam.article
    limit 1
  ) iam_match on true
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
