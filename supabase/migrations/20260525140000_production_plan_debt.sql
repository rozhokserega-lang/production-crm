-- Частичный финал в цехе: долг по плану при недовыпуске.

create table if not exists public.production_plan_debts (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  item text not null,
  material text not null default '',
  week text not null default '',
  qty integer not null check (qty > 0),
  product_article text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_plan_debts_week
  on public.production_plan_debts (week, item);

create index if not exists idx_production_plan_debts_order_id
  on public.production_plan_debts (order_id);

alter table public.production_plan_debts enable row level security;

drop policy if exists production_plan_debts_select on public.production_plan_debts;
create policy production_plan_debts_select
  on public.production_plan_debts for select to authenticated using (true);

drop policy if exists production_plan_debts_insert on public.production_plan_debts;
create policy production_plan_debts_insert
  on public.production_plan_debts for insert to authenticated with check (true);

drop policy if exists production_plan_debts_update on public.production_plan_debts;
create policy production_plan_debts_update
  on public.production_plan_debts for update to authenticated using (true) with check (true);

drop policy if exists production_plan_debts_delete on public.production_plan_debts;
create policy production_plan_debts_delete
  on public.production_plan_debts for delete to authenticated using (true);

grant select, insert, update, delete on public.production_plan_debts to authenticated, service_role;

create or replace function public.trg_production_plan_debts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_production_plan_debts_touch_updated_at on public.production_plan_debts;
create trigger trg_production_plan_debts_touch_updated_at
  before update on public.production_plan_debts
  for each row execute function public.trg_production_plan_debts_touch_updated_at();

create or replace function public.web_get_production_plan_debts()
returns table (
  id uuid,
  order_id text,
  item text,
  material text,
  week text,
  qty integer,
  product_article text,
  note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, order_id, item, material, week, qty, product_article, note, created_at
  from public.production_plan_debts
  order by week desc nulls last, item asc, created_at desc;
$$;

create or replace function public.web_finalize_workshop_order(
  p_order_id text,
  p_qty_ready numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_total numeric;
  v_ready numeric;
  v_debt numeric;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  select * into v_order
  from public.orders
  where trim(coalesce(order_id, '')) = trim(coalesce(p_order_id, ''))
  for update;

  if v_order.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if coalesce(v_order.shipped, false) = true then
    raise exception 'Order already shipped: %', p_order_id;
  end if;

  v_total := greatest(0, coalesce(v_order.qty, 0));
  v_ready := greatest(0, least(coalesce(p_qty_ready, v_total), v_total));
  v_debt := v_total - v_ready;

  if v_ready <= 0 then
    raise exception 'Qty ready must be > 0';
  end if;

  if v_debt > 0 then
    insert into public.production_plan_debts (
      order_id, item, material, week, qty, product_article, note
    )
    values (
      v_order.order_id,
      coalesce(v_order.item, ''),
      coalesce(v_order.material, ''),
      coalesce(v_order.week, ''),
      v_debt::integer,
      coalesce(v_order.product_article, ''),
      'недовыпуск при финале'
    );
  end if;

  update public.orders
  set qty = v_ready,
      updated_at = now()
  where order_id = v_order.order_id
  returning * into v_order;

  perform public.web_set_stage_done(v_order.order_id, 'shipping');

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'qtyReady', v_ready,
    'qtyDebt', v_debt,
    'week', coalesce(v_order.week, ''),
    'item', coalesce(v_order.item, '')
  );
end;
$$;

grant execute on function public.web_get_production_plan_debts() to anon, authenticated, service_role;
grant execute on function public.web_finalize_workshop_order(text, numeric) to anon, authenticated, service_role;
