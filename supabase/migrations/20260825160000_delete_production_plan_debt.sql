-- Удаление записей долга по плану из вкладки «Долг».

create or replace function public.web_delete_production_plan_debt(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if p_id is null then
    raise exception 'Debt id is required';
  end if;

  delete from public.production_plan_debts
  where id = p_id;

  return found;
end;
$$;

create or replace function public.web_delete_production_plan_debts(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_deleted integer := 0;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  with removed as (
    delete from public.production_plan_debts
    where id = any(p_ids)
    returning 1
  )
  select count(*)::integer into v_deleted from removed;

  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.web_delete_production_plan_debt(uuid) to authenticated, service_role;
grant execute on function public.web_delete_production_plan_debts(uuid[]) to authenticated, service_role;
