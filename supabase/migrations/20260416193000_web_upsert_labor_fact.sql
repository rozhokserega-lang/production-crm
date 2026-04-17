create unique index if not exists ux_labor_facts_order_id
  on public.labor_facts(order_id);

create or replace function public.web_upsert_labor_fact(
  p_order_id text,
  p_item text default null,
  p_week text default null,
  p_qty numeric default 0,
  p_pilka_min numeric default 0,
  p_kromka_min numeric default 0,
  p_pras_min numeric default 0,
  p_assembly_min numeric default 0,
  p_date_finished date default null
)
returns public.labor_facts
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_row public.labor_facts;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_order_id = '' then
    raise exception 'p_order_id is required';
  end if;

  insert into public.labor_facts (
    order_id,
    item,
    week,
    qty,
    pilka_min,
    kromka_min,
    pras_min,
    assembly_min,
    date_finished
  )
  values (
    v_order_id,
    nullif(trim(coalesce(p_item, '')), ''),
    nullif(trim(coalesce(p_week, '')), ''),
    greatest(0, coalesce(p_qty, 0)),
    greatest(0, coalesce(p_pilka_min, 0)),
    greatest(0, coalesce(p_kromka_min, 0)),
    greatest(0, coalesce(p_pras_min, 0)),
    greatest(0, coalesce(p_assembly_min, 0)),
    p_date_finished
  )
  on conflict (order_id)
  do update
    set item = excluded.item,
        week = excluded.week,
        qty = excluded.qty,
        pilka_min = excluded.pilka_min,
        kromka_min = excluded.kromka_min,
        pras_min = excluded.pras_min,
        assembly_min = excluded.assembly_min,
        date_finished = excluded.date_finished,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

alter function public.web_upsert_labor_fact(
  text, text, text, numeric, numeric, numeric, numeric, numeric, date
)
  set search_path = public, pg_temp;

grant execute on function public.web_upsert_labor_fact(
  text, text, text, numeric, numeric, numeric, numeric, numeric, date
) to anon, authenticated;
