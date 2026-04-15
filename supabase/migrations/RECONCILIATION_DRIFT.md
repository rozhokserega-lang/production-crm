# Reconciliation Drift Notes

This document records drift found between:

- current Supabase DB migration history
- SQL files tracked in this repository

## DB-history-only migrations (not yet materialized as SQL files here)

These versions are present in DB history and likely represent incremental refinements:

- `20260410184201_order_pipeline_stage_core_v2`
- `20260410184431_order_pipeline_compute_ready_to_ship_first`
- `20260414063134_prefer_table_color_for_section_articles_material`
- `20260414063217_prefer_item_tail_before_plan_material_in_section_articles`
- `20260414063302_improve_section_articles_color_fallback_split_part`
- `20260414064040_add_white_sections_and_aliases_for_plan_dialog`
- `20260414064247_filter_trailing_dot_items_in_section_articles`
- `20260414064330_filter_trailing_dot_items_by_right_trim`
- `20260414065016_split_white_variants_from_base_sections`
- `20260414072555_sync_white_section_pairs_guard_in_section_articles`
- `20260414081311_material_size_map_and_strict_donini_rule`
- `20260414081332_material_size_alias_dub_bardolino_nat`
- `20260414082127_extend_output_rules_for_avella`
- `20260414082445_cremona_custom_output_2_and_1_5`
- `20260414082618_solito2_fixed_output_6`
- `20260414082828_solito1150_fixed_output_6`
- `20260414083028_solito1350_fixed_output_4`
- `20260414083103_solito1350_priority_over_1150`
- `20260414083442_stabile_custom_output_4_and_3`
- `20260414083812_donini_grande_output_and_leftover_rules`
- `20260414084041_klassiko_fixed_6_and_remove_gambia`
- `20260414084310_premier_fixed_5_add_missing_materials`
- `20260414084550_map_tv_loft_sections`
- `20260414085144_fix_section_articles_fallback_for_empty_mapped_sections`
- `20260414085337_fix_section_articles_backup_from_item_article_map`
- `20260414090724_donini_r_sections_and_slate_filter`
- `20260414090953_fix_preview_plan_permissions`
- `20260414100129_consume_options_suggested_sheets_and_remove_stabile_1150`
- `20260414101713_fix_plan_cell_call_resolve_output_signature`
- `20260414101737_fix_plan_cell_without_format_type_column`
- `20260414101952_dedupe_plan_cells_by_week_and_normalized_item_fix`
- `20260414102027_normalize_week_key_for_plan_dedup`
- `20260414102104_fix_col_key_reuse_for_existing_plan_row`
- `20260414102449_enforce_unique_manual_plan_rows_normalized`

## Decision taken in this repo

- Keep `20260410184258_*` and `20260414075812_*` as non-destructive guard migrations.
- Keep copied baseline migrations as source-controlled SQL.
- Avoid importing legacy monolithic SQL blindly.

## Next hardening step (optional)

Export function/table DDL from current DB and backfill each missing version with an atomic SQL file
that is either:

1) exact DDL change, or
2) explicit no-op marker with justification.
