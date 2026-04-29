-- Fix ambiguous reference to "article" inside plpgsql functions that return table columns.

create or replace function public.web_upsert_metal_catalog_item(
  p_article text,
  p_name text,
  p_is_active boolean default true
)
returns table(
  article text,
  name text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_name text := trim(coalesce(p_name, ''));
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;

  insert into public.metal_product_catalog(article, name, is_active)
  values (v_article, v_name, coalesce(p_is_active, true))
  on conflict on constraint metal_product_catalog_pkey
  do update set
    name = excluded.name,
    is_active = excluded.is_active,
    updated_at = now();

  perform public.web_audit_log_event(
    'upsert_metal_catalog_item',
    'metal_product_catalog',
    v_article,
    jsonb_build_object(
      'name', v_name,
      'is_active', coalesce(p_is_active, true)
    )
  );

  return query
  select
    c.article,
    c.name,
    c.is_active,
    c.updated_at
  from public.metal_product_catalog c
  where c.article = v_article;
end;
$$;

create or replace function public.web_create_metal_work_item(
  p_article text,
  p_name text,
  p_week text,
  p_qty numeric
)
returns table(
  id bigint,
  article text,
  name text,
  week text,
  qty numeric,
  current_stage text,
  stage_status text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_week text := nullif(trim(coalesce(p_week, '')), '');
  v_qty numeric := coalesce(p_qty, 0);
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;
  if v_qty <= 0 then
    raise exception 'qty must be > 0';
  end if;

  insert into public.metal_product_catalog(article, name, is_active)
  values (v_article, v_name, true)
  on conflict on constraint metal_product_catalog_pkey
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  return query
  insert into public.metal_work_items(article, name, week, qty, current_stage, stage_status, status)
  values (v_article, v_name, v_week, v_qty, 'laser', 'queued', 'active')
  returning
    metal_work_items.id,
    metal_work_items.article,
    metal_work_items.name,
    metal_work_items.week,
    metal_work_items.qty,
    metal_work_items.current_stage,
    metal_work_items.stage_status,
    metal_work_items.status,
    metal_work_items.created_at,
    metal_work_items.updated_at;

  perform public.web_audit_log_event(
    'create_metal_work_item',
    'metal_work_items',
    currval('public.metal_work_items_id_seq')::text,
    jsonb_build_object(
      'article', v_article,
      'name', v_name,
      'week', v_week,
      'qty', v_qty
    )
  );
end;
$$;
