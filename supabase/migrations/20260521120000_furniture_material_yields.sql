-- Per-color material yield (kits_per_sheet) for custom furniture templates.

alter table public.furniture_custom_templates
  add column if not exists material_yields jsonb not null default '[]'::jsonb;

comment on column public.furniture_custom_templates.material_yields is
  'Array of {material, kits_per_sheet} — yield per color/material; kits_per_sheet >= 1 = kits/sheet, (0,1) = sheets/kit';

drop function if exists public.web_upsert_furniture_custom_template(text, jsonb, numeric);

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
      'material_yields', coalesce(t.material_yields, '[]'::jsonb),
      'updated_at', t.updated_at
    ) order by t.product_name
  ), '[]'::jsonb)
  from public.furniture_custom_templates t;
$$;

create or replace function public.web_upsert_furniture_custom_template(
  p_product_name text,
  p_details jsonb default '[]'::jsonb,
  p_kits_per_sheet numeric default 0,
  p_material_yields jsonb default '[]'::jsonb
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
  v_yields jsonb := coalesce(p_material_yields, '[]'::jsonb);
  v_row public.furniture_custom_templates;
  v_elem jsonb;
  v_material text;
  v_yield_kits numeric;
  v_clean jsonb := '[]'::jsonb;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_name = '' then
    raise exception 'product_name is required';
  end if;
  if jsonb_typeof(v_details) <> 'array' then
    raise exception 'details must be a json array';
  end if;
  if jsonb_typeof(v_yields) <> 'array' then
    raise exception 'material_yields must be a json array';
  end if;
  if v_kits < 0 then
    v_kits := 0;
  end if;

  for v_elem in select value from jsonb_array_elements(v_yields)
  loop
    v_material := trim(coalesce(v_elem->>'material', ''));
    v_yield_kits := coalesce((v_elem->>'kits_per_sheet')::numeric, 0);
    if v_material = '' or v_yield_kits <= 0 then
      continue;
    end if;
    v_clean := v_clean || jsonb_build_array(
      jsonb_build_object('material', v_material, 'kits_per_sheet', v_yield_kits)
    );
  end loop;

  insert into public.furniture_custom_templates (product_name, details, kits_per_sheet, material_yields, created_by)
  values (v_name, v_details, v_kits, v_clean, auth.uid())
  on conflict (product_name)
  do update set
    details = excluded.details,
    kits_per_sheet = excluded.kits_per_sheet,
    material_yields = excluded.material_yields
  returning * into v_row;

  return jsonb_build_object(
    'product_name', v_row.product_name,
    'details', v_row.details,
    'kits_per_sheet', v_row.kits_per_sheet,
    'material_yields', coalesce(v_row.material_yields, '[]'::jsonb),
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.web_upsert_furniture_custom_template(text, jsonb, numeric, jsonb) to authenticated;
