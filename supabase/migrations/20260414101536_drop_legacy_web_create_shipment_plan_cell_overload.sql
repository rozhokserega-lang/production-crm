drop function if exists public.web_create_shipment_plan_cell(text, text, text, text, numeric);

grant execute on function public.web_create_shipment_plan_cell(text, text, text, text, numeric, text)
  to anon, authenticated, service_role;
