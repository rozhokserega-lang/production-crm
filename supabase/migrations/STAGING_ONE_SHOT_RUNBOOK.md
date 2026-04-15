# Staging One-Shot Runbook

This runbook applies the reconciled migration stream safely on staging.

## Constraints in current environment

- Supabase CLI is not installed in this workspace shell.
- Recommended apply method: Supabase SQL Editor (or MCP `apply_migration` in sequence).

## Step 1: Precheck (read-only)

Run this in SQL Editor:

```sql
-- Required migration versions present?
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20260410183905','20260410184258','20260410184944',
  '20260413161629','20260413185422',
  '20260414054021','20260414062456','20260414075812',
  '20260414100726','20260414101536','20260414102959','20260414120612'
)
order by version;

-- Critical RPC signatures and anon execute
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'web_set_stage_in_work','web_set_stage_pause','web_set_stage_done',
    'web_get_shipment_board','web_resolve_output_per_sheet'
  )
order by p.proname, args;
```

## Step 2: Apply in this exact order

Apply each SQL file from `supabase/migrations`:

1. `20260410183905_order_pipeline_stage.sql`
2. `20260410184944_orders_grant_and_rls_select.sql`
3. `20260413161629_seed_item_color_map_user_list.sql`
4. `20260413185422_item_article_map_catalog_columns_and_rpc.sql`
5. `20260414054021_sync_web_get_section_articles_mapped_articles.sql`
6. `20260414062456_fix_resolve_color_name_security_definer.sql`
7. `20260414100726_fix_manual_plan_duplicates_by_normalized_key.sql`
8. `20260414101536_drop_legacy_web_create_shipment_plan_cell_overload.sql`
9. `20260414102959_dedupe_web_get_shipment_table_output.sql`
10. `20260414120612_furniture_b_column_article_mapping.sql`
11. `20260415100000_materials_stock_sync_from_gsheet.sql`
12. `20260415100500_leftovers_aggregate_stock.sql`
13. `20260415101000_optional_order_pipeline_stage.sql`
14. `20260410184258_order_pipeline_stage_rpcs_drop_and_create.sql` (guard)
15. `20260414075812_shipment_format_rules_donini_big_small.sql` (guard)

## Step 3: Postcheck (read-only)

Run this in SQL Editor:

```sql
-- Required objects must exist after apply
select
  to_regclass('public.material_size_map') is not null as has_material_size_map,
  to_regprocedure('public.web_set_stage_in_work(text,text,text)') is not null as has_set_in_work,
  to_regprocedure('public.web_set_stage_pause(text,text)') is not null as has_set_pause,
  to_regprocedure('public.web_set_stage_done(text,text)') is not null as has_set_done,
  to_regprocedure('public.web_get_shipment_board()') is not null as has_shipment_board,
  to_regprocedure('public.web_resolve_output_per_sheet(text,text,text,numeric)') is not null as has_resolve_output;

-- RLS visibility snapshot for key tables
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'orders','materials_stock','materials_leftovers','material_size_map',
    'shipment_plan_cells','shipment_cells','section_catalog','item_article_map'
  )
order by c.relname;
```

## Safety note

Files `20260410184258_*` and `20260414075812_*` are intentionally non-destructive guard migrations
to prevent accidental overwrite of logic already split into many historical DB migrations.
