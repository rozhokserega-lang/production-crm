-- Частичная сборка: долг по плану при недовыпуске на этапе «Сборка».

create or replace function public.web_finalize_assembly_order(
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
      'недовыпуск при сборке'
    );
  end if;

  update public.orders
  set qty = v_ready,
      updated_at = now()
  where order_id = v_order.order_id
  returning * into v_order;

  perform public.web_set_stage_done(v_order.order_id, 'assembly');

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'qtyReady', v_ready,
    'qtyDebt', v_debt,
    'week', coalesce(v_order.week, ''),
    'item', coalesce(v_order.item, '')
  );
end;
$$;

grant execute on function public.web_finalize_assembly_order(text, numeric) to anon, authenticated, service_role;
