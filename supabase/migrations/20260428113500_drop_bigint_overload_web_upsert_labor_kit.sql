-- Fix ambiguous PostgREST RPC resolution when multiple overloads exist.
-- Keep the canonical signature with int (labor_kits.id is serial/int),
-- and drop a stray bigint overload that may exist from older migrations.

drop function if exists public.web_upsert_labor_kit(bigint, text, jsonb);

-- Keep stage-specific order RPC wrappers in sync with the current
-- web_get_orders_all() result shape. The wrappers previously used select *
-- with an older RETURNS TABLE signature, so PostgREST failed at runtime once
-- stage timing columns were added to web_get_orders_all().
drop function if exists public.web_get_orders_pilka();
drop function if exists public.web_get_orders_kromka();
drop function if exists public.web_get_orders_pras();

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
  pilka_started_at timestamptz,
  pilka_done_at timestamptz,
  pilka_pause_started_at timestamptz,
  pilka_pause_acc_min integer,
  kromka_status text,
  kromka_started_at timestamptz,
  kromka_done_at timestamptz,
  kromka_pause_started_at timestamptz,
  kromka_pause_acc_min integer,
  pras_status text,
  pras_started_at timestamptz,
  pras_done_at timestamptz,
  pras_pause_started_at timestamptz,
  pras_pause_acc_min integer,
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
    u.order_id,
    u.source_row_id,
    u.product_article,
    u.item,
    u.material,
    u.week,
    u.qty,
    u.pilka_status,
    u.pilka_started_at,
    u.pilka_done_at,
    u.pilka_pause_started_at,
    u.pilka_pause_acc_min,
    u.kromka_status,
    u.kromka_started_at,
    u.kromka_done_at,
    u.kromka_pause_started_at,
    u.kromka_pause_acc_min,
    u.pras_status,
    u.pras_started_at,
    u.pras_done_at,
    u.pras_pause_started_at,
    u.pras_pause_acc_min,
    u.assembly_status,
    u.overall_status,
    u.pipeline_stage,
    u.color_name,
    u.sheets_needed,
    u.admin_comment,
    u.created_at,
    u.updated_at
  from public.web_get_orders_all() u
  where u.pipeline_stage = 'pilka';
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
  pilka_started_at timestamptz,
  pilka_done_at timestamptz,
  pilka_pause_started_at timestamptz,
  pilka_pause_acc_min integer,
  kromka_status text,
  kromka_started_at timestamptz,
  kromka_done_at timestamptz,
  kromka_pause_started_at timestamptz,
  kromka_pause_acc_min integer,
  pras_status text,
  pras_started_at timestamptz,
  pras_done_at timestamptz,
  pras_pause_started_at timestamptz,
  pras_pause_acc_min integer,
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
    u.order_id,
    u.source_row_id,
    u.product_article,
    u.item,
    u.material,
    u.week,
    u.qty,
    u.pilka_status,
    u.pilka_started_at,
    u.pilka_done_at,
    u.pilka_pause_started_at,
    u.pilka_pause_acc_min,
    u.kromka_status,
    u.kromka_started_at,
    u.kromka_done_at,
    u.kromka_pause_started_at,
    u.kromka_pause_acc_min,
    u.pras_status,
    u.pras_started_at,
    u.pras_done_at,
    u.pras_pause_started_at,
    u.pras_pause_acc_min,
    u.assembly_status,
    u.overall_status,
    u.pipeline_stage,
    u.color_name,
    u.sheets_needed,
    u.admin_comment,
    u.created_at,
    u.updated_at
  from public.web_get_orders_all() u
  where u.pipeline_stage = 'kromka';
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
  pilka_started_at timestamptz,
  pilka_done_at timestamptz,
  pilka_pause_started_at timestamptz,
  pilka_pause_acc_min integer,
  kromka_status text,
  kromka_started_at timestamptz,
  kromka_done_at timestamptz,
  kromka_pause_started_at timestamptz,
  kromka_pause_acc_min integer,
  pras_status text,
  pras_started_at timestamptz,
  pras_done_at timestamptz,
  pras_pause_started_at timestamptz,
  pras_pause_acc_min integer,
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
    u.order_id,
    u.source_row_id,
    u.product_article,
    u.item,
    u.material,
    u.week,
    u.qty,
    u.pilka_status,
    u.pilka_started_at,
    u.pilka_done_at,
    u.pilka_pause_started_at,
    u.pilka_pause_acc_min,
    u.kromka_status,
    u.kromka_started_at,
    u.kromka_done_at,
    u.kromka_pause_started_at,
    u.kromka_pause_acc_min,
    u.pras_status,
    u.pras_started_at,
    u.pras_done_at,
    u.pras_pause_started_at,
    u.pras_pause_acc_min,
    u.assembly_status,
    u.overall_status,
    u.pipeline_stage,
    u.color_name,
    u.sheets_needed,
    u.admin_comment,
    u.created_at,
    u.updated_at
  from public.web_get_orders_all() u
  where u.pipeline_stage = 'pras';
$$;

grant execute on function public.web_get_orders_pilka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_kromka() to anon, authenticated, service_role;
grant execute on function public.web_get_orders_pras() to anon, authenticated, service_role;

