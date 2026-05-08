-- RPC to seed Excel-derived furniture templates into furniture_custom_templates.
-- Uses ON CONFLICT DO NOTHING so existing manually-customised templates are
-- never overwritten. The frontend calls this once when the Excel workbook loads.

create or replace function public.web_seed_furniture_strap_template(
  p_product_name text,
  p_details      jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
begin
  if v_name = '' then return; end if;
  if jsonb_typeof(coalesce(p_details, 'null'::jsonb)) <> 'array' then return; end if;

  insert into public.furniture_custom_templates (product_name, details)
  values (v_name, p_details)
  on conflict (product_name) do nothing;
end;
$$;

grant execute on function public.web_seed_furniture_strap_template(text, jsonb)
  to authenticated;
