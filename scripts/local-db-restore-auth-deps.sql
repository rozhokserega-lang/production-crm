-- Заглушки auth.users для существующих crm_user_roles (локальная БД).
-- Прод-пользователи не входят в дамп (public-only), поэтому создаём id+email,
-- чтобы FK и join в web_list_crm_user_roles работали.
INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, email_change_token_current)
SELECT
  c.user_id,
  (c.user_id || '@local.crm') AS email,
  'authenticated' AS aud,
  'authenticated' AS role,
  '{}'::jsonb AS raw_app_meta_data,
  '{}'::jsonb AS raw_user_meta_data,
  now() AS created_at,
  now() AS updated_at,
  '' AS confirmation_token,
  '' AS email_change,
  '' AS email_change_token_new,
  '' AS email_change_token_current
FROM public.crm_user_roles c
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id);

-- FK из crm_user_roles на auth.users
alter table public.crm_user_roles
  drop constraint if exists crm_user_roles_user_id_fkey;
alter table public.crm_user_roles
  add constraint crm_user_roles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- RLS-политики, сброшенные DROP SCHEMA auth CASCADE
drop policy if exists "crm_user_roles_select_authenticated" on public.crm_user_roles;
create policy "crm_user_roles_select_authenticated"
  on public.crm_user_roles
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists metal_product_catalog_write_auth on public.metal_product_catalog;
create policy metal_product_catalog_write_auth
  on public.metal_product_catalog
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists metal_work_items_write_auth on public.metal_work_items;
create policy metal_work_items_write_auth
  on public.metal_work_items
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists metal_stage_events_write_auth on public.metal_stage_events;
create policy metal_stage_events_write_auth
  on public.metal_stage_events
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists metal_catalog_categories_write_auth on public.metal_catalog_categories;
create policy metal_catalog_categories_write_auth
  on public.metal_catalog_categories
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists metal_work_queue_write_admin_manager on public.metal_work_queue;
create policy metal_work_queue_write_admin_manager
  on public.metal_work_queue
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);