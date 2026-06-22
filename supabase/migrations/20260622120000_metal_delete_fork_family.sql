-- Удаление заказа вместе с ветками / слияниями (fork / multi_merge).

create or replace function public.metal_collect_work_item_family_ids(p_item_id bigint)
returns bigint[]
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item public.metal_work_items%rowtype;
  v_root_id bigint;
  v_root_group uuid;
  v_ids bigint[];
begin
  if coalesce(p_item_id, 0) <= 0 then
    return array[]::bigint[];
  end if;

  select * into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id;

  if v_item.id is null then
    return array[]::bigint[];
  end if;

  v_root_id := nullif((v_item.fork_meta->>'root_parent_id')::bigint, 0);

  if v_root_id is null and v_item.parent_id is not null then
    v_root_id := v_item.parent_id;
  end if;

  if v_root_id is null and (
    v_item.status = 'split'
    or (coalesce(v_item.fork_meta->>'mode', '') = 'multi_merge' and v_item.fork_role is null)
  ) then
    v_root_id := v_item.id;
  end if;

  if v_root_id is null then
    v_root_id := v_item.id;
  end if;

  select mwi.fork_group_id into v_root_group
  from public.metal_work_items mwi
  where mwi.id = v_root_id;

  select coalesce(array_agg(distinct mwi.id), array[]::bigint[])
  into v_ids
  from public.metal_work_items mwi
  where mwi.id = v_root_id
     or mwi.parent_id = v_root_id
     or nullif((mwi.fork_meta->>'root_parent_id')::bigint, 0) = v_root_id
     or (
       v_root_group is not null
       and mwi.fork_group_id = v_root_group
     );

  return coalesce(v_ids, array[]::bigint[]);
end;
$$;

create or replace function public.web_delete_metal_work_item(p_item_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ids bigint[];
  v_deleted_count integer;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if coalesce(p_item_id, 0) <= 0 then
    raise exception 'invalid item id';
  end if;

  v_ids := public.metal_collect_work_item_family_ids(p_item_id);

  if coalesce(array_length(v_ids, 1), 0) < 1 then
    raise exception 'work item not found';
  end if;

  delete from public.metal_work_items mwi
  where mwi.id = any(v_ids);

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count < 1 then
    raise exception 'work item not found';
  end if;

  perform public.web_audit_log_event(
    'delete_metal_work_item',
    'metal_work_items',
    p_item_id::text,
    jsonb_build_object(
      'deleted', true,
      'deleted_ids', to_jsonb(v_ids),
      'deleted_count', v_deleted_count
    )
  );

  return true;
end;
$$;

grant execute on function public.metal_collect_work_item_family_ids(bigint) to anon, authenticated, service_role;
grant execute on function public.web_delete_metal_work_item(bigint) to anon, authenticated, service_role;
