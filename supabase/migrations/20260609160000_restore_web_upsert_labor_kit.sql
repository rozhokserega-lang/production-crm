-- web_upsert_labor_kit was dropped by bigint-overload cleanup migrations;
-- labor_kits.id is bigint and web_delete_labor_kit already uses bigint.

drop function if exists public.web_upsert_labor_kit(bigint, text, jsonb);
drop function if exists public.web_upsert_labor_kit(int, text, jsonb);

create or replace function public.web_upsert_labor_kit(
  p_id       bigint default null,
  p_kit_name text default '',
  p_items    jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.labor_kits;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if p_id is not null then
    update public.labor_kits
      set kit_name = nullif(trim(coalesce(p_kit_name, '')), ''),
          items    = coalesce(p_items, '[]'::jsonb)
      where id = p_id
      returning * into v_row;

    if not found then
      raise exception 'labor_kit with id % not found', p_id;
    end if;
  else
    insert into public.labor_kits (kit_name, items)
      values (
        nullif(trim(coalesce(p_kit_name, '')), ''),
        coalesce(p_items, '[]'::jsonb)
      )
      returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',         v_row.id,
    'kit_name',   v_row.kit_name,
    'name',       v_row.kit_name,
    'items',      v_row.items,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

alter function public.web_upsert_labor_kit(bigint, text, jsonb)
  set search_path = public, pg_temp;

grant execute on function public.web_upsert_labor_kit(bigint, text, jsonb)
  to anon, authenticated, service_role;
