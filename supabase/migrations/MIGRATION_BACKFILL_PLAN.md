# Migration Backfill Plan

Goal: move legacy SQL from `migration/` into a strict timestamped stream in `supabase/migrations/` without changing runtime behavior automatically.

## Important safety rule

- This plan does **not** apply SQL to database by itself.
- Apply only after review in staging.

## Legacy to timestamp mapping

| Legacy file | Target migration filename | Status |
|---|---|---|
| `migration/supabase_order_pipeline_stage.sql` | `20260410183905_order_pipeline_stage.sql` | copied |
| `migration/supabase_orders_rls_select.sql` | `20260410184944_orders_grant_and_rls_select.sql` | copied |
| `migration/seed_item_color_map_user_list.sql` | `20260413161629_seed_item_color_map_user_list.sql` | copied |
| `migration/item_article_map_catalog_columns_and_rpc.sql` | `20260413185422_item_article_map_catalog_columns_and_rpc.sql` | copied |
| `migration/supabase_dedupe_shipment_table_output.sql` | `20260414102959_dedupe_web_get_shipment_table_output.sql` | copied |
| `migration/supabase_drop_legacy_plan_cell_overload.sql` | `20260414101536_drop_legacy_web_create_shipment_plan_cell_overload.sql` | copied |
| `migration/supabase_fix_manual_plan_duplicates.sql` | `20260414100726_fix_manual_plan_duplicates_by_normalized_key.sql` | copied (requires follow-up diff check) |
| `migration/supabase_furniture_product_map.sql` | `20260414120612_furniture_b_column_article_mapping.sql` | copied |
| `migration/supabase_shipment_format_rules.sql` | `20260414075812_shipment_format_rules_donini_big_small.sql` | reconciled as non-destructive guard (see RECONCILIATION_DRIFT.md) |
| `migration/generated_item_article_catalog_from_xlsx.sql` | `20260414054021_sync_web_get_section_articles_mapped_articles.sql` | copied |
| `migration/supabase_web_set_stage_rpc.sql` | `20260410184258_order_pipeline_stage_rpcs_drop_and_create.sql` | reconciled as non-destructive guard (see RECONCILIATION_DRIFT.md) |
| `migration/fix_web_upsert_item_color_map_ambiguous.sql` | `20260414062456_fix_resolve_color_name_security_definer.sql` | copied |
| `migration/materials_stock_sync_from_gsheet.sql` | `20260415100000_materials_stock_sync_from_gsheet.sql` | copied |
| `migration/supabase_leftovers_aggregate_stock.sql` | `20260415100500_leftovers_aggregate_stock.sql` | copied |
| `migration/optional_order_pipeline_stage.sql` | `20260415101000_optional_order_pipeline_stage.sql` | copied (deprecated marker) |

## Execution order for backfill

1. Copy exact matches first (no SQL edits).
2. Diff and split "requires manual diff" files into separate timestamped migrations.
3. Add missing migrations with new timestamps only after confirming they are not already included in DB state.
4. Validate:
   - required RPC exists and signature matches frontend payload
   - grants for `anon` and `authenticated` are present
   - RLS policies are expected
5. Only then apply to clean staging project if needed.
