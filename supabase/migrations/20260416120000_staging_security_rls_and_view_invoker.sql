-- Staging hardening: close security advisor ERROR findings.
-- 1) Enable RLS on exposed tables that were missing it.
-- 2) Add explicit read policies used by current frontend RPC/view access.
-- 3) Switch v_sheet_orders_mirror to SECURITY INVOKER semantics.

alter table if exists public.section_catalog enable row level security;
alter table if exists public.material_size_map enable row level security;
alter table if exists public.furniture_product_map enable row level security;
alter table if exists public.materials_leftovers enable row level security;
alter table if exists public.labor_group_stats enable row level security;
alter table if exists public.crm_runtime_settings enable row level security;
alter table if exists public.sheet_orders_mirror enable row level security;
alter table if exists public.furniture_detail_item_map enable row level security;
alter table if exists public.crm_user_roles enable row level security;

grant select on public.section_catalog to anon, authenticated;
grant select on public.material_size_map to anon, authenticated;
grant select on public.furniture_product_map to anon, authenticated;
grant select on public.materials_leftovers to anon, authenticated;
grant select on public.labor_group_stats to anon, authenticated;
grant select on public.crm_runtime_settings to anon, authenticated;
grant select on public.sheet_orders_mirror to anon, authenticated;
grant select on public.furniture_detail_item_map to anon, authenticated;
grant select on public.crm_user_roles to authenticated;

drop policy if exists "section_catalog_select_public" on public.section_catalog;
create policy "section_catalog_select_public"
  on public.section_catalog
  for select
  to anon, authenticated
  using (true);

drop policy if exists "material_size_map_select_public" on public.material_size_map;
create policy "material_size_map_select_public"
  on public.material_size_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "furniture_product_map_select_public" on public.furniture_product_map;
create policy "furniture_product_map_select_public"
  on public.furniture_product_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "materials_leftovers_select_public" on public.materials_leftovers;
create policy "materials_leftovers_select_public"
  on public.materials_leftovers
  for select
  to anon, authenticated
  using (true);

drop policy if exists "labor_group_stats_select_public" on public.labor_group_stats;
create policy "labor_group_stats_select_public"
  on public.labor_group_stats
  for select
  to anon, authenticated
  using (true);

drop policy if exists "crm_runtime_settings_select_public" on public.crm_runtime_settings;
create policy "crm_runtime_settings_select_public"
  on public.crm_runtime_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "sheet_orders_mirror_select_public" on public.sheet_orders_mirror;
create policy "sheet_orders_mirror_select_public"
  on public.sheet_orders_mirror
  for select
  to anon, authenticated
  using (true);

drop policy if exists "furniture_detail_item_map_select_public" on public.furniture_detail_item_map;
create policy "furniture_detail_item_map_select_public"
  on public.furniture_detail_item_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "crm_user_roles_select_authenticated" on public.crm_user_roles;
create policy "crm_user_roles_select_authenticated"
  on public.crm_user_roles
  for select
  to authenticated
  using (auth.uid() is not null);

alter view if exists public.v_sheet_orders_mirror set (security_invoker = true);
