-- Replacement parts orders: created by warehouse staff, synced across all clients.

create table if not exists public.replacement_orders (
  id text primary key,                          -- client-generated RPL-{timestamp}
  product text not null,
  part text not null,
  qty integer not null default 1,
  color text not null default '',
  note text not null default '',
  status text not null default '🟡 Новый',
  sent_to_work boolean not null default false,
  packaging_accepted boolean not null default false,
  accepted_at timestamptz null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_replacement_orders_created_at
  on public.replacement_orders (created_at desc);

create index if not exists idx_replacement_orders_sent_packaging
  on public.replacement_orders (sent_to_work, packaging_accepted);

alter table public.replacement_orders enable row level security;

drop policy if exists replacement_orders_select on public.replacement_orders;
create policy replacement_orders_select
  on public.replacement_orders for select
  to authenticated
  using (true);

drop policy if exists replacement_orders_insert on public.replacement_orders;
create policy replacement_orders_insert
  on public.replacement_orders for insert
  to authenticated
  with check (true);

drop policy if exists replacement_orders_update on public.replacement_orders;
create policy replacement_orders_update
  on public.replacement_orders for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists replacement_orders_delete on public.replacement_orders;
create policy replacement_orders_delete
  on public.replacement_orders for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.replacement_orders to authenticated, service_role;

-- Trigger: touch updated_at on every update
create or replace function public.trg_replacement_orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_replacement_orders_touch_updated_at on public.replacement_orders;
create trigger trg_replacement_orders_touch_updated_at
before update on public.replacement_orders
for each row execute function public.trg_replacement_orders_touch_updated_at();

-- RPC: list all orders, newest first
create or replace function public.web_get_replacement_orders()
returns table (
  id text,
  product text,
  part text,
  qty integer,
  color text,
  note text,
  status text,
  sent_to_work boolean,
  packaging_accepted boolean,
  accepted_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id, product, part, qty, color, note, status,
    sent_to_work, packaging_accepted, accepted_at, created_at
  from public.replacement_orders
  order by created_at desc;
$$;

grant execute on function public.web_get_replacement_orders() to anon, authenticated, service_role;

-- RPC: create a new order
create or replace function public.web_create_replacement_order(
  p_id text,
  p_product text,
  p_part text,
  p_qty integer,
  p_color text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.replacement_orders (id, product, part, qty, color, note)
  values (p_id, p_product, p_part, p_qty, p_color, p_note)
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.web_create_replacement_order(text,text,text,integer,text,text)
  to anon, authenticated, service_role;

-- RPC: mark order as sent to work (by warehouse)
create or replace function public.web_send_replacement_order_to_work(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.replacement_orders
  set sent_to_work = true,
      status = '🟣 В упаковке'
  where id = p_id;
end;
$$;

grant execute on function public.web_send_replacement_order_to_work(text)
  to anon, authenticated, service_role;

-- RPC: accept order into packaging (by production)
create or replace function public.web_accept_replacement_order_packaging(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.replacement_orders
  set packaging_accepted = true,
      status = '🟢 Принят в работу',
      accepted_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.web_accept_replacement_order_packaging(text)
  to anon, authenticated, service_role;

-- RPC: delete an order
create or replace function public.web_delete_replacement_order(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.replacement_orders where id = p_id;
end;
$$;

grant execute on function public.web_delete_replacement_order(text)
  to anon, authenticated, service_role;
