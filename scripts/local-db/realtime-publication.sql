-- Локальный Realtime (Postgres logical replication). После BASELINE + migrations.
-- Без publication supabase_realtime сервис Realtime не получит изменения.

DO $pub$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.orders;
  END IF;
END
$pub$;

DO $add$
DECLARE
  t text;
  tables text[] := ARRAY[
    'public.shipment_plan_cells',
    'public.labor_facts',
    'public.materials_stock',
    'public.materials_leftovers',
    'public.materials_moves',
    'public.crm_audit_log',
    'public.furniture_product_map',
    'public.furniture_detail_item_map',
    'public.metal_components_stock',
    'public.metal_work_queue'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'skip publication (missing table): %', t;
    END;
  END LOOP;
END
$add$;
