create or replace function public.web_delete_order_by_id(p_order_id text)
returns table(
  deleted_orders integer,
  deleted_labor_facts integer,
  deleted_leftovers integer,
  deleted_plank_batches integer
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_deleted_orders integer := 0;
  v_deleted_labor integer := 0;
  v_deleted_leftovers integer := 0;
  v_deleted_plank integer := 0;
begin
  if v_order_id = '' then
    raise exception 'order_id is required';
  end if;

  -- Remove shipment rows linked to the order before deleting the order itself.
  -- This prevents orphaned rows from staying visible in Shipment after deletion from Stats.
  delete from public.shipment_plan_cells sp
  where trim(coalesce(sp.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.shipment_cells sc
  where trim(coalesce(sc.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.labor_facts where order_id = v_order_id;
  get diagnostics v_deleted_labor = row_count;

  delete from public.materials_leftovers where order_id = v_order_id;
  get diagnostics v_deleted_leftovers = row_count;

  delete from public.plank_batches where order_id = v_order_id;
  get diagnostics v_deleted_plank = row_count;

  delete from public.orders where order_id = v_order_id;
  get diagnostics v_deleted_orders = row_count;

  if v_deleted_orders = 0 then
    raise exception 'Order not found: %', v_order_id;
  end if;

  return query select v_deleted_orders, v_deleted_labor, v_deleted_leftovers, v_deleted_plank;
end;
$$;

grant execute on function public.web_delete_order_by_id(text) to anon, authenticated, service_role;
