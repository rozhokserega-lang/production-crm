-- Связь заказа замены (склад) с заказом цеха и статус «Готово» при финале производства.

alter table public.replacement_orders
  add column if not exists workshop_order_id text null,
  add column if not exists completed_at timestamptz null;

create index if not exists idx_replacement_orders_workshop_order_id
  on public.replacement_orders (workshop_order_id)
  where workshop_order_id is not null;

create or replace function public.web_replacement_item_key(p_product text, p_part text)
returns text
language sql
immutable
as $$
  select public.web_norm_item_key(
    case
      when trim(coalesce(p_product, '')) = 'Прочее' then trim(coalesce(p_part, ''))
      else trim(coalesce(p_product, '')) || ' — ' || trim(coalesce(p_part, ''))
    end
  );
$$;

create or replace function public.web_complete_replacement_for_workshop_order(p_workshop_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id text := trim(coalesce(p_workshop_order_id, ''));
  v_item_key text;
begin
  if v_order_id = '' then
    return;
  end if;

  update public.replacement_orders r
  set
    status = '✅ Готово',
    completed_at = coalesce(r.completed_at, now()),
    workshop_order_id = coalesce(r.workshop_order_id, v_order_id)
  where r.workshop_order_id = v_order_id
     or (
       r.workshop_order_id is null
       and r.packaging_accepted = true
       and r.status = '🟢 Принят в работу'
       and exists (
         select 1
         from public.orders o
         where o.order_id = v_order_id
           and coalesce(o.shipped, false) = true
           and public.web_norm_item_key(coalesce(o.item, '')) = public.web_replacement_item_key(r.product, r.part)
       )
     );

  -- На случай если shipped ещё не проставлен, но финал уже нажат
  select public.web_replacement_item_key(r.product, r.part)
    into v_item_key
  from public.replacement_orders r
  where r.workshop_order_id = v_order_id
  limit 1;

  if v_item_key is not null then
    update public.replacement_orders r
    set
      status = '✅ Готово',
      completed_at = coalesce(r.completed_at, now()),
      workshop_order_id = coalesce(r.workshop_order_id, v_order_id)
    where r.workshop_order_id = v_order_id
       or (
         r.workshop_order_id is null
         and r.packaging_accepted = true
         and r.status = '🟢 Принят в работу'
         and public.web_replacement_item_key(r.product, r.part) = v_item_key
         and exists (
           select 1 from public.orders o where o.order_id = v_order_id
         )
       );
  end if;
end;
$$;

create or replace function public.web_accept_replacement_order_packaging(
  p_id text,
  p_workshop_order_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  update public.replacement_orders
  set
    packaging_accepted = true,
    status = '🟢 Принят в работу',
    accepted_at = now(),
    workshop_order_id = nullif(trim(coalesce(p_workshop_order_id, '')), '')
  where id = p_id;
end;
$$;

create or replace function public.web_reset_replacement_order_packaging(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  update public.replacement_orders
  set
    packaging_accepted = false,
    status = '🟣 В упаковке',
    accepted_at = null,
    workshop_order_id = null,
    completed_at = null
  where id = p_id
    and sent_to_work = true;
end;
$$;

drop function if exists public.web_get_replacement_orders();

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
  workshop_order_id text,
  completed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id, product, part, qty, color, note, status,
    sent_to_work, packaging_accepted, accepted_at,
    workshop_order_id, completed_at, created_at
  from public.replacement_orders
  order by created_at desc;
$$;

-- Ретроактивно: уже отгруженные в цехе → «Готово» на складе
update public.replacement_orders r
set
  status = '✅ Готово',
  completed_at = coalesce(r.completed_at, o.updated_at, now()),
  workshop_order_id = coalesce(r.workshop_order_id, o.order_id)
from public.orders o
where r.packaging_accepted = true
  and r.status = '🟢 Принят в работу'
  and coalesce(o.shipped, false) = true
  and public.web_norm_item_key(coalesce(o.item, '')) = public.web_replacement_item_key(r.product, r.part);

create or replace function public.trg_orders_sync_replacement_on_shipped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.shipped, false) = true
     and coalesce(old.shipped, false) is distinct from true then
    perform public.web_complete_replacement_for_workshop_order(new.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_sync_replacement_on_shipped on public.orders;
create trigger trg_orders_sync_replacement_on_shipped
  after update of shipped on public.orders
  for each row
  execute function public.trg_orders_sync_replacement_on_shipped();

grant execute on function public.web_complete_replacement_for_workshop_order(text)
  to anon, authenticated, service_role;
grant execute on function public.web_accept_replacement_order_packaging(text, text)
  to anon, authenticated, service_role;
