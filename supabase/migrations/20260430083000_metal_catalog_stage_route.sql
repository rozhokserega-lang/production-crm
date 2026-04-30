-- Add stage_route to metal_product_catalog and update related RPCs.
-- stage_route is an ordered array of stage keys the item passes through.
-- Valid stage keys: 'laser', 'saw', 'bending', 'welding', 'painting'.
-- Default route: laser → bending → welding → painting.

alter table public.metal_product_catalog
  add column if not exists stage_route text[] not null
  default array['laser', 'bending', 'welding', 'painting'];

-- Validate existing + future values
alter table public.metal_product_catalog
  drop constraint if exists metal_product_catalog_stage_route_check;
alter table public.metal_product_catalog
  add constraint metal_product_catalog_stage_route_check
  check (
    array_length(stage_route, 1) >= 1
    and stage_route <@ array['laser', 'saw', 'bending', 'welding', 'painting']
  );

-- Update web_list_metal_catalog to return stage_route
drop function if exists public.web_list_metal_catalog(boolean);

create or replace function public.web_list_metal_catalog(
  p_active_only boolean default true
)
returns table(
  article     text,
  name        text,
  is_active   boolean,
  stage_route text[],
  updated_at  timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    c.article,
    c.name,
    c.is_active,
    c.stage_route,
    c.updated_at
  from public.metal_product_catalog c
  where not coalesce(p_active_only, true) or c.is_active = true
  order by c.article;
$$;

-- Update web_upsert_metal_catalog_item to accept and store stage_route
drop function if exists public.web_upsert_metal_catalog_item(text, text, boolean);

create or replace function public.web_upsert_metal_catalog_item(
  p_article     text,
  p_name        text,
  p_is_active   boolean  default true,
  p_stage_route text[]   default null
)
returns table(
  article     text,
  name        text,
  is_active   boolean,
  stage_route text[],
  updated_at  timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article     text   := upper(trim(coalesce(p_article, '')));
  v_name        text   := trim(coalesce(p_name, ''));
  v_stage_route text[] := coalesce(p_stage_route, array['laser', 'bending', 'welding', 'painting']);
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;
  if array_length(v_stage_route, 1) < 1 then
    raise exception 'stage_route must have at least one stage';
  end if;
  -- Validate each stage
  if not (v_stage_route <@ array['laser', 'saw', 'bending', 'welding', 'painting']) then
    raise exception 'stage_route contains invalid stage(s)';
  end if;

  insert into public.metal_product_catalog as c (article, name, is_active, stage_route)
  values (v_article, v_name, coalesce(p_is_active, true), v_stage_route)
  on conflict on constraint metal_product_catalog_pkey do update
    set name        = excluded.name,
        is_active   = excluded.is_active,
        stage_route = excluded.stage_route,
        updated_at  = now();

  return query
    select c.article, c.name, c.is_active, c.stage_route, c.updated_at
    from public.metal_product_catalog c
    where c.article = v_article;
end;
$$;

-- New RPC: delete a catalog item (only if no active work items reference it)
create or replace function public.web_delete_metal_catalog_item(
  p_article text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_active_count integer;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;

  -- Block deletion if active (non-done) work items exist
  select count(*) into v_active_count
  from public.metal_work_items
  where article = v_article
    and status not in ('done', 'cancelled');

  if v_active_count > 0 then
    raise exception 'Нельзя удалить артикул: есть % активных заданий в производстве', v_active_count;
  end if;

  delete from public.metal_product_catalog where article = v_article;

  insert into public.crm_audit_log (action, entity, entity_id, note)
  values ('delete', 'metal_product_catalog', v_article,
          'catalog item deleted via web_delete_metal_catalog_item');
end;
$$;

grant execute on function public.web_list_metal_catalog(boolean)              to authenticated;
grant execute on function public.web_upsert_metal_catalog_item(text, text, boolean, text[]) to authenticated;
grant execute on function public.web_delete_metal_catalog_item(text)          to authenticated;
