# Staging Go-Live Gate (Supabase Primary + GAS Duplicate)

## 1) Environment and deploy config

- Build source: `fronted/`
- Required env:
  - `VITE_BACKEND_PROVIDER=supabase`
  - `VITE_SUPABASE_URL=...`
  - `VITE_SUPABASE_ANON_KEY=...`
  - `VITE_GAS_WEBAPP_URL=...`
  - `VITE_HYBRID_DUPLICATE_ACTIONS=webSetPilkaDone,webSetKromkaDone,webSetPrasDone,webSetAssemblyDone,webSetShippingDone,webSendShipmentToWork`

## 2) DB security gate

Run Supabase advisors:

- `security`: no `ERROR`
- `performance`: no blockers (only non-critical INFO is acceptable)

## 3) SQL smoke checks (read-only)

```sql
select
  (select count(*) from public.web_get_orders_all()) as orders_all_cnt,
  (select count(*) from public.web_get_orders_pilka()) as orders_pilka_cnt,
  (select count(*) from public.web_get_orders_kromka()) as orders_kromka_cnt,
  (select count(*) from public.web_get_orders_pras()) as orders_pras_cnt,
  (select count(*) from public.web_get_labor_table()) as labor_rows_cnt;
```

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'web_get_orders_all','web_get_orders_pilka','web_get_orders_kromka',
    'web_get_orders_pras','web_get_labor_table','web_get_order_stats',
    'web_send_shipment_to_work','web_upsert_item_color_map'
  )
order by 1, 2;
```

## 4) Business smoke flow

1. Open staging and create/import one test order.
2. Move test order through stages: `pilka -> kromka -> pras -> assembly -> shipping`.
3. Trigger shipment action (`webSendShipmentToWork` path in UI).
4. Verify materials/leftovers screens load without RPC errors.
5. In browser console, filter logs by `[CRM Hybrid]` and confirm duplicate status is `ok`.

## 5) Daily health-check procedure

- Daily (manual or cron from CI runner) execute:
  1. both advisors (`security`, `performance`);
  2. SQL smoke checks from section 3;
  3. one read API check from frontend endpoint.
- Persist outputs into a log artifact/date-stamped file.
- If an advisor adds new `ERROR`, block release until fixed.
