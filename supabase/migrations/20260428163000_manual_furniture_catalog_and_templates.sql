-- Allow creating custom furniture items from the app UI:
-- - Save plan catalog entries (section/articles/material colors) into item_article_map
-- - Save composition (details per unit) into furniture_custom_templates

create table if not exists public.furniture_custom_templates (
  product_name text primary key,
  details jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.furniture_custom_templates enable row level security;

drop policy if exists furniture_custom_templates_select_public on public.furniture_custom_templates;
create policy furniture_custom_templates_select_public
  on public.furniture_custom_templates
  for select
  to anon, authenticated
  using (true);

-- Write policy is intentionally restrictive: via RPC only (security definer).

create or replace function public.trg_furniture_custom_templates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_furniture_custom_templates_touch_updated_at on public.furniture_custom_templates;
create trigger trg_furniture_custom_templates_touch_updated_at
before update on public.furniture_custom_templates
for each row
execute function public.trg_furniture_custom_templates_touch_updated_at();

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
      'updated_at', t.updated_at
    ) order by t.product_name
  ), '[]'::jsonb)
  from public.furniture_custom_templates t;
$$;

create or replace function public.web_upsert_furniture_custom_template(
  p_product_name text,
  p_details jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_details jsonb := coalesce(p_details, '[]'::jsonb);
  v_row public.furniture_custom_templates;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_name = '' then
    raise exception 'product_name is required';
  end if;
  if jsonb_typeof(v_details) <> 'array' then
    raise exception 'details must be a json array';
  end if;

  insert into public.furniture_custom_templates (product_name, details, created_by)
  values (v_name, v_details, auth.uid())
  on conflict (product_name)
  do update set details = excluded.details
  returning * into v_row;

  return jsonb_build_object(
    'product_name', v_row.product_name,
    'details', v_row.details,
    'updated_at', v_row.updated_at
  );
end;
$$;

-- Upsert plan catalog rows for the created furniture item.
create or replace function public.web_upsert_item_article_map(
  p_section_name text,
  p_item_name text,
  p_article text,
  p_colors text[] default null,
  p_sort_order integer default 999
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_section text := trim(coalesce(p_section_name, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_article text := trim(coalesce(p_article, ''));
  v_sort integer := coalesce(p_sort_order, 999);
  v_colors text[] := p_colors;
  v_color text;
  v_count integer := 0;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_section = '' then
    raise exception 'section_name is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if v_article = '' then
    raise exception 'article is required';
  end if;
  if v_sort < 0 then v_sort := 999; end if;

  if v_colors is null or array_length(v_colors, 1) is null then
    v_colors := array['']::text[];
  end if;

  delete from public.item_article_map
  where source = 'manual'
    and trim(coalesce(section_name, '')) = v_section
    and trim(coalesce(item_name, '')) = v_item;

  foreach v_color in array v_colors loop
    v_color := trim(coalesce(v_color, ''));
    insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
    values (v_article, v_item, 'manual', v_section, v_color, v_sort);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'section_name', v_section,
    'item_name', v_item,
    'article', v_article,
    'rows_created', v_count
  );
end;
$$;

grant select on public.furniture_custom_templates to anon, authenticated, service_role;
grant insert, update, delete on public.furniture_custom_templates to service_role;

grant execute on function public.web_get_furniture_custom_templates() to anon, authenticated;
grant execute on function public.web_upsert_furniture_custom_template(text, jsonb) to authenticated;
grant execute on function public.web_upsert_item_article_map(text, text, text, text[], integer) to authenticated;

