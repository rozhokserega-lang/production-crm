# Safe Apply Order (Staging)

This order is designed to avoid breaking currently working environments.

## 1) Baseline copied migrations (safe first)

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

## 2) Reconciled guard migrations (non-destructive checks)

14. `20260410184258_order_pipeline_stage_rpcs_drop_and_create.sql`
15. `20260414075812_shipment_format_rules_donini_big_small.sql`

## 3) Post-apply verification

- RPC exists:
  - `web_set_stage_in_work(text,text,text)`
  - `web_set_stage_pause(text,text)`
  - `web_set_stage_done(text,text)`
  - `web_get_shipment_board()`
  - `web_resolve_output_per_sheet(text,text,text,numeric)`
- Table exists: `public.material_size_map`
- Frontend RPC map calls succeed with ANON key.

## 4) Important note

Two timestamps (`20260410184258`, `20260414075812`) are represented as safe guard migrations here.
Their historical logic is already spread across many DB migrations in the target project.
Do not replace these guards with legacy monolithic SQL without full object-level diff.
