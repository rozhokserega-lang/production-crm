-- The frontend (useAppState.js) subscribes to postgres_changes on 11 tables,
-- but only public.orders was in the supabase_realtime publication, so events
-- for the other tables never reached clients and the app fell back to polling.
-- Add the remaining tables so live updates work for shipment, warehouse,
-- labor and metal views. All tables have RLS enabled with SELECT policies,
-- so Realtime delivers rows only to users allowed to read them.
-- Applied to nsdwypcbhmfseotclkrm via MCP apply_migration on 2026-07-08.

alter publication supabase_realtime add table
  public.shipment_plan_cells,
  public.labor_facts,
  public.materials_stock,
  public.materials_leftovers,
  public.materials_moves,
  public.crm_audit_log,
  public.furniture_product_map,
  public.furniture_detail_item_map,
  public.metal_components_stock,
  public.metal_work_queue;
