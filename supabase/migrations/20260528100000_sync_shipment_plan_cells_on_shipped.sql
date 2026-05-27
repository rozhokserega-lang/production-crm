-- Сброс устаревших флагов plan cell, когда связанный заказ уже shipped.

update public.shipment_plan_cells spc
set
  can_send_to_work = false,
  in_work = false,
  updated_at = now()
from public.orders o
where trim(coalesce(spc.source_row_id, '')) <> ''
  and trim(coalesce(o.source_row_id, '')) = trim(coalesce(spc.source_row_id, ''))
  and trim(coalesce(o.week, '')) = trim(coalesce(spc.week, ''))
  and coalesce(o.pipeline_stage, '') = 'shipped'
  and (spc.can_send_to_work = true or spc.in_work = true);

update public.shipment_plan_cells spc
set
  can_send_to_work = false,
  in_work = false,
  updated_at = now()
from public.orders o
where trim(coalesce(o.week, '')) = trim(coalesce(spc.week, ''))
  and public.web_norm_item_key(o.item) = public.web_norm_item_key(spc.item)
  and coalesce(o.pipeline_stage, '') = 'shipped'
  and spc.can_send_to_work = true
  and trim(coalesce(o.source_row_id, '')) <> trim(coalesce(spc.source_row_id, ''));

create or replace function public.trg_orders_sync_shipment_plan_cell_on_shipped()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  if coalesce(new.pipeline_stage, '') = 'shipped'
     and coalesce(old.pipeline_stage, '') is distinct from 'shipped' then
    update public.shipment_plan_cells spc
    set
      can_send_to_work = false,
      in_work = false,
      updated_at = now()
    where trim(coalesce(spc.week, '')) = trim(coalesce(new.week, ''))
      and (
        trim(coalesce(spc.source_row_id, '')) = trim(coalesce(new.source_row_id, ''))
        or public.web_norm_item_key(spc.item) = public.web_norm_item_key(new.item)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_sync_shipment_plan_cell_on_shipped on public.orders;
create trigger trg_orders_sync_shipment_plan_cell_on_shipped
  after update of pipeline_stage on public.orders
  for each row
  execute function public.trg_orders_sync_shipment_plan_cell_on_shipped();
