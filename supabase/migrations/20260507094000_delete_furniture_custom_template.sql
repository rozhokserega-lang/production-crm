-- Delete furniture custom template (product in constructor) and its manual article mappings.
-- This is meant to remove duplicates created in the furniture editor UI.

create or replace function public.web_delete_furniture_custom_template(
  p_product_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_tpl_deleted integer := 0;
  v_map_deleted integer := 0;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_name = '' then
    raise exception 'product_name is required';
  end if;

  delete from public.furniture_custom_templates t
  where t.product_name = v_name;

  get diagnostics v_tpl_deleted = row_count;

  delete from public.item_article_map iam
  where iam.source = 'manual'
    and lower(trim(iam.item_name)) = lower(v_name);

  get diagnostics v_map_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'product_name', v_name,
    'templates_deleted', v_tpl_deleted,
    'manual_item_article_map_deleted', v_map_deleted
  );
end;
$$;

grant execute on function public.web_delete_furniture_custom_template(text) to anon, authenticated, service_role;

