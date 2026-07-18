#!/usr/bin/env python3
"""Embed metal catalog JSON into migration SQL (run from repo root)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "scripts" / "data" / "metal_catalog_sergey.json"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "20260617180000_metal_catalog_categories.sql"
SEED_MIGRATION_PATH = ROOT / "supabase" / "migrations" / "20260617180100_metal_catalog_seed_data.sql"

SCHEMA_AND_RPC = r"""-- Metal catalog: categories, bulk route, import from Sergey spreadsheet.

alter table public.metal_product_catalog
  add column if not exists category text not null default '';

create index if not exists idx_metal_product_catalog_category
  on public.metal_product_catalog(category, is_active, article);

create table if not exists public.metal_catalog_categories (
  name text primary key,
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  stage_route text[] not null default array['laser', 'bending', 'welding', 'painting'],
  process_graph jsonb not null default public.metal_linear_route_to_graph(array['laser', 'bending', 'welding', 'painting']),
  updated_at timestamptz not null default now()
);

create or replace function public.trg_metal_catalog_categories_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_metal_catalog_categories_touch_updated_at on public.metal_catalog_categories;
create trigger trg_metal_catalog_categories_touch_updated_at
before update on public.metal_catalog_categories
for each row
execute function public.trg_metal_catalog_categories_touch_updated_at();

alter table public.metal_catalog_categories enable row level security;

drop policy if exists metal_catalog_categories_read_all on public.metal_catalog_categories;
create policy metal_catalog_categories_read_all
  on public.metal_catalog_categories
  for select
  to authenticated, anon
  using (true);

drop policy if exists metal_catalog_categories_write_auth on public.metal_catalog_categories;
create policy metal_catalog_categories_write_auth
  on public.metal_catalog_categories
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select on public.metal_catalog_categories to anon, authenticated, service_role;
grant insert, update, delete on public.metal_catalog_categories to authenticated, service_role;

drop function if exists public.web_list_metal_catalog(boolean);

create or replace function public.web_list_metal_catalog(
  p_active_only boolean default true
)
returns table(
  article       text,
  name          text,
  category      text,
  is_active     boolean,
  stage_route   text[],
  process_graph jsonb,
  updated_at    timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    c.article,
    c.name,
    coalesce(nullif(trim(c.category), ''), 'Без категории') as category,
    c.is_active,
    c.stage_route,
    c.process_graph,
    c.updated_at
  from public.metal_product_catalog c
  where not coalesce(p_active_only, true) or c.is_active = true
  order by coalesce(nullif(trim(c.category), ''), 'Без категории'), c.article;
$$;

drop function if exists public.web_list_metal_catalog_categories();

create or replace function public.web_list_metal_catalog_categories()
returns table(
  name          text,
  is_hidden     boolean,
  sort_order    integer,
  stage_route   text[],
  process_graph jsonb,
  item_count    bigint,
  updated_at    timestamptz
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    cat.name,
    cat.is_hidden,
    cat.sort_order,
    cat.stage_route,
    cat.process_graph,
    coalesce(cnt.item_count, 0) as item_count,
    cat.updated_at
  from public.metal_catalog_categories cat
  left join lateral (
    select count(*)::bigint as item_count
    from public.metal_product_catalog c
    where c.is_active = true
      and coalesce(nullif(trim(c.category), ''), 'Без категории') = cat.name
  ) cnt on true
  order by cat.sort_order, cat.name;
$$;

drop function if exists public.web_upsert_metal_catalog_item(text, text, boolean, text[], jsonb);
drop function if exists public.web_upsert_metal_catalog_item(text, text, boolean, text[], jsonb, text);

create or replace function public.web_upsert_metal_catalog_item(
  p_article       text,
  p_name          text,
  p_is_active     boolean default true,
  p_stage_route   text[] default null,
  p_process_graph jsonb default null,
  p_category      text default null
)
returns table(
  article       text,
  name          text,
  category      text,
  is_active     boolean,
  stage_route   text[],
  process_graph jsonb,
  updated_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article       text   := upper(trim(coalesce(p_article, '')));
  v_name          text   := trim(coalesce(p_name, ''));
  v_category      text   := trim(coalesce(p_category, ''));
  v_stage_route   text[] := coalesce(p_stage_route, array['laser', 'bending', 'welding', 'painting']);
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
    if v_process_graph -> 'nodes' is null or jsonb_array_length(v_process_graph -> 'nodes') < 1 then
      raise exception 'process_graph must contain nodes';
    end if;
  else
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if array_length(v_stage_route, 1) is null or array_length(v_stage_route, 1) < 1 then
    raise exception 'stage_route must have at least one stage';
  end if;
  if not (v_stage_route <@ array['laser', 'saw', 'bending', 'welding', 'painting']) then
    raise exception 'stage_route contains invalid stage(s)';
  end if;

  if v_category <> '' then
    insert into public.metal_catalog_categories(name, sort_order)
    values (v_category, 0)
    on conflict (name) do nothing;
  end if;

  insert into public.metal_product_catalog as c (article, name, category, is_active, stage_route, process_graph)
  values (v_article, v_name, v_category, coalesce(p_is_active, true), v_stage_route, v_process_graph)
  on conflict on constraint metal_product_catalog_pkey do update
    set name          = excluded.name,
        category      = excluded.category,
        is_active     = excluded.is_active,
        stage_route   = excluded.stage_route,
        process_graph = excluded.process_graph,
        updated_at    = now();

  return query
    select c.article, c.name, coalesce(nullif(trim(c.category), ''), 'Без категории'), c.is_active, c.stage_route, c.process_graph, c.updated_at
    from public.metal_product_catalog c
    where c.article = v_article;
end;
$$;

drop function if exists public.web_upsert_metal_catalog_category(text, boolean, text[], jsonb, boolean);

create or replace function public.web_upsert_metal_catalog_category(
  p_name               text,
  p_is_hidden          boolean default null,
  p_stage_route        text[] default null,
  p_process_graph      jsonb default null,
  p_apply_route_to_items boolean default false
)
returns table(
  name          text,
  is_hidden     boolean,
  sort_order    integer,
  stage_route   text[],
  process_graph jsonb,
  item_count    bigint,
  updated_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_stage_route text[];
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_name = '' then
    raise exception 'category name required';
  end if;

  insert into public.metal_catalog_categories(name)
  values (v_name)
  on conflict (name) do nothing;

  select cat.stage_route, cat.process_graph
  into v_stage_route, v_process_graph
  from public.metal_catalog_categories cat
  where cat.name = v_name;

  if p_stage_route is not null then
    v_stage_route := p_stage_route;
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
  elsif p_stage_route is not null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if v_stage_route is null or array_length(v_stage_route, 1) is null then
    v_stage_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  if v_process_graph is null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  update public.metal_catalog_categories cat
  set is_hidden = coalesce(p_is_hidden, cat.is_hidden),
      stage_route = v_stage_route,
      process_graph = v_process_graph
  where cat.name = v_name;

  if coalesce(p_apply_route_to_items, false) then
    update public.metal_product_catalog c
    set stage_route = v_stage_route,
        process_graph = v_process_graph,
        updated_at = now()
    where coalesce(nullif(trim(c.category), ''), 'Без категории') = v_name;
  end if;

  return query
    select * from public.web_list_metal_catalog_categories() cat where cat.name = v_name;
end;
$$;

drop function if exists public.web_import_metal_catalog(jsonb, boolean);

create or replace function public.web_import_metal_catalog(
  p_items jsonb,
  p_replace_missing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item jsonb;
  v_row record;
  v_article text;
  v_name text;
  v_category text;
  v_seen text[] := array[]::text[];
  v_cat text;
  v_stage_route text[];
  v_process_graph jsonb;
  v_default_route jsonb := public.metal_linear_route_to_graph(array['laser', 'bending', 'welding', 'painting']);
  v_count integer := 0;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    perform public.web_require_roles(array['manager', 'admin']);
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array';
  end if;

  for v_row in
    select value, ordinality::integer as ord
    from jsonb_array_elements(p_items) with ordinality
  loop
    v_category := trim(coalesce(v_row.value ->> 'category', ''));
    if v_category = '' then
      continue;
    end if;
    insert into public.metal_catalog_categories(name, sort_order, process_graph)
    values (v_category, v_row.ord, v_default_route)
    on conflict (name) do update
      set sort_order = least(public.metal_catalog_categories.sort_order, excluded.sort_order);
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_article := upper(trim(coalesce(v_item ->> 'article', '')));
    v_name := trim(coalesce(v_item ->> 'name', ''));
    v_category := trim(coalesce(v_item ->> 'category', ''));
    if v_article = '' or v_name = '' then
      continue;
    end if;

    v_stage_route := array['laser', 'bending', 'welding', 'painting'];
    v_process_graph := v_default_route;
    if v_category <> '' then
      select cat.stage_route, cat.process_graph
      into v_stage_route, v_process_graph
      from public.metal_catalog_categories cat
      where cat.name = v_category;
    end if;

    insert into public.metal_product_catalog as c (article, name, category, is_active, stage_route, process_graph)
    values (v_article, v_name, v_category, true, v_stage_route, v_process_graph)
    on conflict on constraint metal_product_catalog_pkey do update
      set name = excluded.name,
          category = excluded.category,
          is_active = true,
          stage_route = excluded.stage_route,
          process_graph = excluded.process_graph,
          updated_at = now();

    v_seen := array_append(v_seen, v_article);
    v_count := v_count + 1;
  end loop;

  if coalesce(p_replace_missing, true) then
    update public.metal_product_catalog c
    set is_active = false,
        updated_at = now()
    where c.is_active = true
      and not (c.article = any (v_seen));
  end if;

  return jsonb_build_object('imported', v_count, 'active_articles', cardinality(v_seen));
end;
$$;

grant execute on function public.web_list_metal_catalog(boolean) to authenticated, anon, service_role;
grant execute on function public.web_list_metal_catalog_categories() to authenticated, anon, service_role;
grant execute on function public.web_upsert_metal_catalog_item(text, text, boolean, text[], jsonb, text) to authenticated, anon, service_role;
grant execute on function public.web_upsert_metal_catalog_category(text, boolean, text[], jsonb, boolean) to authenticated, anon, service_role;
grant execute on function public.web_import_metal_catalog(jsonb, boolean) to authenticated, anon, service_role;
"""

SEED_CALL = """
select public.web_import_metal_catalog(
  $metal_catalog_seed$__SEED_JSON__$metal_catalog_seed$::jsonb,
  true
);
"""


def main() -> None:
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    seed_json = json.dumps(rows, ensure_ascii=False)
    if "$metal_catalog_seed$" in seed_json:
        raise SystemExit("seed JSON contains delimiter sequence")
    sql = SCHEMA_AND_RPC.replace("__SEED_JSON__", seed_json)
    MIGRATION_PATH.write_text(SCHEMA_AND_RPC, encoding="utf-8")
    seed_path = ROOT / "scripts" / "apply_metal_catalog_seed.sql"
    seed_sql = SEED_CALL.replace("__SEED_JSON__", seed_json)
    seed_path.write_text(seed_sql, encoding="utf-8")
    import_fn = SCHEMA_AND_RPC.split("drop function if exists public.web_import_metal_catalog(jsonb, boolean);", 1)[1]
    import_fn = import_fn.split("grant execute on function public.web_list_metal_catalog", 1)[0]
    SEED_MIGRATION_PATH.write_text(
        "-- Import Sergey metal catalog (253 items).\n\n" + import_fn.strip() + "\n\n" + seed_sql.strip() + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {MIGRATION_PATH} ({len(SCHEMA_AND_RPC)} bytes)")
    print(f"Wrote {seed_path} ({len(rows)} items)")


if __name__ == "__main__":
    main()
