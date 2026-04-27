-- List labor kits without CRM role check (viewer + anon can read).
-- Saving/deleting kits stays restricted to operator/manager/admin in other RPCs.

create or replace function public.web_get_labor_kits()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',        lk.id,
      'kit_name',  lk.kit_name,
      'name',      lk.kit_name,
      'items',     lk.items,
      'created_at', lk.created_at,
      'updated_at', lk.updated_at
    ) order by lk.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.labor_kits lk;

  return v_result;
end;
$$;

alter function public.web_get_labor_kits()
  set search_path = public, pg_temp;
