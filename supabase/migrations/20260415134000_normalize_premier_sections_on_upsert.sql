create or replace function public.web_normalize_premier_section_name(
  p_section_name text,
  p_item text
)
returns text
language sql
immutable
as $$
  select
    case
      when coalesce(p_item, '') ilike 'Премьер. Белый.%' then 'Премьер белый'
      when coalesce(p_item, '') ilike 'Премьер. Черный.%' then 'Премьер черный'
      else coalesce(p_section_name, '')
    end
$$;

create or replace function public.trg_normalize_premier_section()
returns trigger
language plpgsql
as $$
begin
  new.section_name := public.web_normalize_premier_section_name(new.section_name, new.item);
  return new;
end;
$$;

drop trigger if exists tr_normalize_premier_section_on_plan on public.shipment_plan_cells;
create trigger tr_normalize_premier_section_on_plan
before insert or update of section_name, item
on public.shipment_plan_cells
for each row
execute function public.trg_normalize_premier_section();

drop trigger if exists tr_normalize_premier_section_on_cells on public.shipment_cells;
create trigger tr_normalize_premier_section_on_cells
before insert or update of section_name, item
on public.shipment_cells
for each row
execute function public.trg_normalize_premier_section();
