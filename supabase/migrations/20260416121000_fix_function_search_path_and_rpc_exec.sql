-- Staging hardening: pin function search_path for advisor warnings
-- and ensure critical RPCs are executable by API roles.

alter function public.business_minutes(timestamp with time zone, timestamp with time zone)
  set search_path = public, pg_temp;
alter function public.compute_order_pipeline_stage(text, text, text, text, text)
  set search_path = public, pg_temp;
alter function public.crm_user_roles_touch_updated_at()
  set search_path = public, pg_temp;
alter function public.normalize_item_key(text)
  set search_path = public, pg_temp;
alter function public.orders_set_pipeline_stage()
  set search_path = public, pg_temp;
alter function public.trg_normalize_premier_section()
  set search_path = public, pg_temp;
alter function public.trg_sheet_orders_mirror_touch_updated_at()
  set search_path = public, pg_temp;
alter function public.web_get_labor_table()
  set search_path = public, pg_temp;
alter function public.web_get_order_stats()
  set search_path = public, pg_temp;
alter function public.web_get_orders_all()
  set search_path = public, pg_temp;
alter function public.web_get_orders_kromka()
  set search_path = public, pg_temp;
alter function public.web_get_orders_pilka()
  set search_path = public, pg_temp;
alter function public.web_get_orders_pras()
  set search_path = public, pg_temp;
alter function public.web_is_valid_crm_role(text)
  set search_path = public, pg_temp;
alter function public.web_norm_item_key(text)
  set search_path = public, pg_temp;
alter function public.web_norm_sheet_stage_status(text)
  set search_path = public, pg_temp;
alter function public.web_norm_week_key(text)
  set search_path = public, pg_temp;
alter function public.web_normalize_premier_section_name(text, text)
  set search_path = public, pg_temp;
alter function public.web_send_shipment_to_work(uuid)
  set search_path = public, pg_temp;
alter function public.web_upsert_item_color_map(text, text)
  set search_path = public, pg_temp;

grant execute on function public.web_get_orders_all() to anon, authenticated;
grant execute on function public.web_get_orders_pilka() to anon, authenticated;
grant execute on function public.web_get_orders_kromka() to anon, authenticated;
grant execute on function public.web_get_orders_pras() to anon, authenticated;
grant execute on function public.web_get_labor_table() to anon, authenticated;
grant execute on function public.web_get_order_stats() to anon, authenticated;
grant execute on function public.web_send_shipment_to_work(uuid) to anon, authenticated;
grant execute on function public.web_upsert_item_color_map(text, text) to anon, authenticated;
