-- Close advisor findings: tables with RLS enabled but no policies.
-- Policy model:
-- - operational read tables: explicit SELECT for anon/authenticated
-- - internal sync table: service_role only

alter table if exists public.color_match_rules enable row level security;
alter table if exists public.furniture_sheet_capacity enable row level security;
alter table if exists public.item_article_map enable row level security;
alter table if exists public.item_color_map enable row level security;
alter table if exists public.labor_facts enable row level security;
alter table if exists public.materials_moves enable row level security;
alter table if exists public.materials_stock enable row level security;
alter table if exists public.plank_batch_items enable row level security;
alter table if exists public.plank_batches enable row level security;
alter table if exists public.shipment_cells enable row level security;
alter table if exists public.shipment_plan_cells enable row level security;
alter table if exists public.sync_map enable row level security;

grant select on public.color_match_rules to anon, authenticated;
grant select on public.furniture_sheet_capacity to anon, authenticated;
grant select on public.item_article_map to anon, authenticated;
grant select on public.item_color_map to anon, authenticated;
grant select on public.labor_facts to anon, authenticated;
grant select on public.materials_moves to anon, authenticated;
grant select on public.materials_stock to anon, authenticated;
grant select on public.plank_batch_items to anon, authenticated;
grant select on public.plank_batches to anon, authenticated;
grant select on public.shipment_cells to anon, authenticated;
grant select on public.shipment_plan_cells to anon, authenticated;
grant select on public.sync_map to service_role;

drop policy if exists "color_match_rules_select_public" on public.color_match_rules;
create policy "color_match_rules_select_public"
  on public.color_match_rules
  for select
  to anon, authenticated
  using (true);

drop policy if exists "furniture_sheet_capacity_select_public" on public.furniture_sheet_capacity;
create policy "furniture_sheet_capacity_select_public"
  on public.furniture_sheet_capacity
  for select
  to anon, authenticated
  using (true);

drop policy if exists "item_article_map_select_public" on public.item_article_map;
create policy "item_article_map_select_public"
  on public.item_article_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "item_color_map_select_public" on public.item_color_map;
create policy "item_color_map_select_public"
  on public.item_color_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "labor_facts_select_public" on public.labor_facts;
create policy "labor_facts_select_public"
  on public.labor_facts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "materials_moves_select_public" on public.materials_moves;
create policy "materials_moves_select_public"
  on public.materials_moves
  for select
  to anon, authenticated
  using (true);

drop policy if exists "materials_stock_select_public" on public.materials_stock;
create policy "materials_stock_select_public"
  on public.materials_stock
  for select
  to anon, authenticated
  using (true);

drop policy if exists "plank_batch_items_select_public" on public.plank_batch_items;
create policy "plank_batch_items_select_public"
  on public.plank_batch_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists "plank_batches_select_public" on public.plank_batches;
create policy "plank_batches_select_public"
  on public.plank_batches
  for select
  to anon, authenticated
  using (true);

drop policy if exists "shipment_cells_select_public" on public.shipment_cells;
create policy "shipment_cells_select_public"
  on public.shipment_cells
  for select
  to anon, authenticated
  using (true);

drop policy if exists "shipment_plan_cells_select_public" on public.shipment_plan_cells;
create policy "shipment_plan_cells_select_public"
  on public.shipment_plan_cells
  for select
  to anon, authenticated
  using (true);

drop policy if exists "sync_map_select_service_role" on public.sync_map;
create policy "sync_map_select_service_role"
  on public.sync_map
  for select
  to service_role
  using (true);
