-- Store "kits per sheet" for custom furniture templates to enable future sheet consumption automation.

alter table public.furniture_custom_templates
  add column if not exists kits_per_sheet numeric(12,3) not null default 0;

create or replace function public.web_get_furniture_custom_templates()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_name', t.product_name,
      'details', t.details,
      'kits_per_sheet', t.kits_per_sheet,
      'updated_at', t.updated_at
    ) order by t.product_name
  ), '[]'::jsonb)
  from public.furniture_custom_templates t;
$$;

create or replace function public.web_upsert_furniture_custom_template(
  p_product_name text,
  p_details jsonb default '[]'::jsonb,
  p_kits_per_sheet numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_details jsonb := coalesce(p_details, '[]'::jsonb);
  v_kits numeric := coalesce(p_kits_per_sheet, 0);
  v_row public.furniture_custom_templates;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_name = '' then
    raise exception 'product_name is required';
  end if;
  if jsonb_typeof(v_details) <> 'array' then
    raise exception 'details must be a json array';
  end if;
  if v_kits < 0 then
    v_kits := 0;
  end if;

  insert into public.furniture_custom_templates (product_name, details, kits_per_sheet, created_by)
  values (v_name, v_details, v_kits, auth.uid())
  on conflict (product_name)
  do update set
    details = excluded.details,
    kits_per_sheet = excluded.kits_per_sheet
  returning * into v_row;

  return jsonb_build_object(
    'product_name', v_row.product_name,
    'details', v_row.details,
    'kits_per_sheet', v_row.kits_per_sheet,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.web_upsert_furniture_custom_template(text, jsonb, numeric) to authenticated;

