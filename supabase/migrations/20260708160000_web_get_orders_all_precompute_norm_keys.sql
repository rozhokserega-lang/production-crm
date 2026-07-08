-- Speed up web_get_orders_all: precompute normalized keys once per lookup table
-- instead of re-evaluating web_norm_item_key()/normalize_item_key() (regexp-based)
-- for every (order x map-row) pair, and inline resolve_color_name() logic against
-- the precomputed color map. Output verified identical to the previous version
-- (EXCEPT in both directions = 0 rows); runtime ~4.5s -> ~0.13s.
-- Applied to nsdwypcbhmfseotclkrm via MCP apply_migration on 2026-07-08.

create or replace function public.web_get_orders_all()
 returns table(order_id text, source_row_id text, product_article text, item text, material text, week text, qty numeric, pilka_status text, pilka_started_at timestamptz, pilka_done_at timestamptz, pilka_pause_started_at timestamptz, pilka_pause_acc_min integer, kromka_status text, kromka_started_at timestamptz, kromka_done_at timestamptz, kromka_pause_started_at timestamptz, kromka_pause_acc_min integer, pras_status text, pras_started_at timestamptz, pras_done_at timestamptz, pras_pause_started_at timestamptz, pras_pause_acc_min integer, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamptz, updated_at timestamptz)
 language sql
 stable
as $function$
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
  ),
  iam_norm as materialized (
    select
      nullif(trim(coalesce(iam.article, '')), '') as article,
      public.web_norm_item_key(iam.item_name) as item_key,
      nullif(trim(coalesce(iam.table_color, '')), '') as table_color_raw,
      public.web_norm_item_key(iam.table_color) as color_key,
      coalesce(iam.sort_order, 999) as sort_order
    from public.item_article_map iam
    where nullif(trim(coalesce(iam.article, '')), '') is not null
  ),
  color_norm as materialized (
    select
      m.color_name::text as color_name,
      public.normalize_item_key(m.item_name) as item_key,
      case when m.source = 'manual' then 0 else 1 end as manual_rank,
      m.updated_at
    from public.item_color_map m
  ),
  orders_keyed as materialized (
    select
      o.*,
      public.web_norm_item_key(o.item) as w_item_key,
      public.web_norm_item_key(o.material) as w_material_key,
      public.normalize_item_key(o.item) as n_item_key
    from public.orders o
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
    o.pilka_started_at,
    o.pilka_done_at,
    o.pilka_pause_started_at,
    o.pilka_pause_acc_min,
    o.kromka_status,
    o.kromka_started_at,
    o.kromka_done_at,
    o.kromka_pause_started_at,
    o.kromka_pause_acc_min,
    o.pras_status,
    o.pras_started_at,
    o.pras_done_at,
    o.pras_pause_started_at,
    o.pras_pause_acc_min,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    color_match.color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from orders_keyed o
  left join mirror_latest ml on ml.order_code = trim(coalesce(o.order_id, ''))
  left join lateral (
    select i.article
    from iam_norm i
    where i.item_key = o.w_item_key
       or o.w_item_key like ('%' || i.item_key || '%')
    order by
      case when i.item_key = o.w_item_key then 0 else 1 end,
      case
        when i.table_color_raw is null then 1
        when i.color_key = o.w_material_key then 0
        when o.w_item_key like ('%' || i.color_key) || '%' then 1
        else 2
      end,
      i.sort_order,
      i.article
    limit 1
  ) iam_match on true
  left join lateral (
    select coalesce(
      (
        select c.color_name
        from color_norm c
        where c.item_key = o.n_item_key
        order by c.manual_rank, c.updated_at desc nulls last
        limit 1
      ),
      (
        select c.color_name
        from color_norm c
        where o.n_item_key like ('%' || c.item_key || '%')
        order by length(c.item_key) desc, c.manual_rank, c.updated_at desc nulls last
        limit 1
      )
    ) as color_name
  ) color_match on true
  order by o.updated_at desc nulls last, o.order_id;
$function$;

drop function if exists public.web_get_orders_all_v2();
