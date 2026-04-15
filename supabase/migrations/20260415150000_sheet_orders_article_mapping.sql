alter table public.sheet_orders_mirror
  add column if not exists article_code text,
  add column if not exists mapped_article_code text,
  add column if not exists mapped_item_name text,
  add column if not exists mapped_color_name text;

create index if not exists idx_sheet_orders_mirror_article_code
  on public.sheet_orders_mirror(article_code);

drop function if exists public.web_get_sheet_orders_mirror(text);
drop view if exists public.v_sheet_orders_mirror;

create or replace view public.v_sheet_orders_mirror as
select
  m.sheet_id,
  m.sheet_gid,
  m.sheet_row,
  m.source_created_at_raw,
  m.material_raw,
  m.article_code,
  m.mapped_article_code,
  m.mapped_item_name,
  m.mapped_color_name,
  m.order_code,
  m.source_order_id_raw,
  m.item_label,
  m.plan_value,
  m.qty_value,
  m.pilka_status_raw,
  public.web_norm_sheet_stage_status(m.pilka_status_raw) as pilka_status,
  m.kromka_status_raw,
  public.web_norm_sheet_stage_status(m.kromka_status_raw) as kromka_status,
  m.prisadka_status_raw,
  public.web_norm_sheet_stage_status(m.prisadka_status_raw) as prisadka_status,
  m.assembly_status_raw,
  public.web_norm_sheet_stage_status(m.assembly_status_raw) as assembly_status,
  m.overall_status_raw,
  public.web_norm_sheet_stage_status(m.overall_status_raw) as overall_status,
  m.shipped_raw,
  m.source_synced_at,
  m.updated_at
from public.sheet_orders_mirror m;

create or replace function public.web_get_sheet_orders_mirror(
  p_sheet_gid text default null
)
returns table(
  sheet_row integer,
  source_created_at_raw text,
  material_raw text,
  article_code text,
  mapped_article_code text,
  order_code text,
  source_order_id_raw text,
  item_label text,
  plan_value integer,
  qty_value numeric,
  pilka_status text,
  kromka_status text,
  prisadka_status text,
  assembly_status text,
  overall_status text,
  shipped_raw text,
  source_synced_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    v.sheet_row,
    v.source_created_at_raw,
    v.material_raw,
    v.article_code,
    v.mapped_article_code,
    v.order_code,
    v.source_order_id_raw,
    v.item_label,
    v.plan_value,
    v.qty_value,
    v.pilka_status,
    v.kromka_status,
    v.prisadka_status,
    v.assembly_status,
    v.overall_status,
    v.shipped_raw,
    v.source_synced_at
  from public.v_sheet_orders_mirror v
  where p_sheet_gid is null or trim(p_sheet_gid) = '' or v.sheet_gid = trim(p_sheet_gid)
  order by v.sheet_row;
$$;

grant select on public.v_sheet_orders_mirror to anon, authenticated, service_role;
grant execute on function public.web_get_sheet_orders_mirror(text) to anon, authenticated, service_role;
