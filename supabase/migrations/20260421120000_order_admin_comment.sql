-- Комментарий администратора к заказу (канбан + панель деталей).

alter table public.orders
  add column if not exists admin_comment text not null default '';

comment on column public.orders.admin_comment is
  'Комментарий администратора CRM; хранится на заказе, виден при смене этапов.';

-- Зависят от сигнатуры web_get_orders_all — пересоздаём цепочку.
drop function if exists public.web_get_orders_pras();
drop function if exists public.web_get_orders_kromka();
drop function if exists public.web_get_orders_pilka();
drop function if exists public.web_get_orders_all();

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
  admin_comment text,
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
    trim(coalesce(o.admin_comment, '')) as admin_comment,
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

create or replace function public.web_set_order_admin_comment(
  p_order_id text,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_id text := trim(coalesce(p_order_id, ''));
  v_comment text := trim(coalesce(p_comment, ''));
begin
  perform public.web_require_roles(array['admin']);

  if v_id = '' then
    raise exception 'order_id required';
  end if;

  if length(v_comment) > 4000 then
    raise exception 'comment too long';
  end if;

  update public.orders
  set admin_comment = v_comment,
      updated_at = now()
  where order_id = v_id;

  if not found then
    raise exception 'order not found';
  end if;
end;
$$;

grant execute on function public.web_set_order_admin_comment(text, text) to anon, authenticated, service_role;
