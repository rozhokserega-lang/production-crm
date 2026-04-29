create or replace function public.web_delete_metal_work_item(
  p_item_id bigint
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_deleted_id bigint;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if coalesce(p_item_id, 0) <= 0 then
    raise exception 'invalid item id';
  end if;

  delete from public.metal_work_items mwi
  where mwi.id = p_item_id
  returning mwi.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'work item not found';
  end if;

  perform public.web_audit_log_event(
    'delete_metal_work_item',
    'metal_work_items',
    v_deleted_id::text,
    jsonb_build_object('deleted', true)
  );

  return true;
end;
$$;

grant execute on function public.web_delete_metal_work_item(bigint) to anon, authenticated, service_role;
