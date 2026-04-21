-- Foundation for furniture->metal mapping and metal components stock.
-- Compatible with existing schema: does NOT alter public.item_article_map.

create table if not exists public.furniture_metal_map (
  id bigserial primary key,
  furniture_article text not null,
  metal_article text not null,
  metal_name text,
  qty_per_unit integer not null default 1 check (qty_per_unit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint furniture_metal_map_uq unique (furniture_article, metal_article)
);

comment on table public.furniture_metal_map is
  'BOM mapping: furniture article -> metal component article (+qty per unit).';

create table if not exists public.metal_components_stock (
  metal_article text primary key,
  metal_name text not null,
  qty_available integer not null default 0 check (qty_available >= 0),
  qty_reserved integer not null default 0 check (qty_reserved >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.metal_components_stock is
  'Current stock balances for metal components.';

create table if not exists public.metal_components_moves (
  id bigserial primary key,
  metal_article text not null references public.metal_components_stock(metal_article) on delete cascade,
  delta integer not null,
  reason text not null,
  order_id text,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.metal_components_moves is
  'Stock movements for metal components (+in, -out).';

create index if not exists idx_furniture_metal_map_furniture_article
  on public.furniture_metal_map (furniture_article);
create index if not exists idx_furniture_metal_map_metal_article
  on public.furniture_metal_map (metal_article);
create index if not exists idx_metal_components_moves_metal_article_created_at
  on public.metal_components_moves (metal_article, created_at desc);

create or replace function public.trg_furniture_metal_map_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_furniture_metal_map_touch_updated_at on public.furniture_metal_map;
create trigger tr_furniture_metal_map_touch_updated_at
before update on public.furniture_metal_map
for each row
execute function public.trg_furniture_metal_map_touch_updated_at();

create or replace function public.trg_metal_components_stock_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_metal_components_stock_touch_updated_at on public.metal_components_stock;
create trigger tr_metal_components_stock_touch_updated_at
before update on public.metal_components_stock
for each row
execute function public.trg_metal_components_stock_touch_updated_at();

alter table public.furniture_metal_map enable row level security;
alter table public.metal_components_stock enable row level security;
alter table public.metal_components_moves enable row level security;

drop policy if exists "furniture_metal_map_select_public" on public.furniture_metal_map;
create policy "furniture_metal_map_select_public"
  on public.furniture_metal_map
  for select
  to anon, authenticated
  using (true);

drop policy if exists "metal_components_stock_select_public" on public.metal_components_stock;
create policy "metal_components_stock_select_public"
  on public.metal_components_stock
  for select
  to anon, authenticated
  using (true);

drop policy if exists "metal_components_moves_select_public" on public.metal_components_moves;
create policy "metal_components_moves_select_public"
  on public.metal_components_moves
  for select
  to anon, authenticated
  using (true);

grant select on public.furniture_metal_map to anon, authenticated, service_role;
grant select on public.metal_components_stock to anon, authenticated, service_role;
grant select on public.metal_components_moves to anon, authenticated, service_role;

create or replace function public.web_get_metal_for_furniture(
  p_furniture_article text
)
returns table (
  furniture_article text,
  metal_article text,
  metal_name text,
  qty_per_unit integer,
  qty_available integer,
  qty_reserved integer
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    trim(m.furniture_article)::text as furniture_article,
    trim(m.metal_article)::text as metal_article,
    trim(coalesce(m.metal_name, s.metal_name, ''))::text as metal_name,
    m.qty_per_unit,
    coalesce(s.qty_available, 0)::integer as qty_available,
    coalesce(s.qty_reserved, 0)::integer as qty_reserved
  from public.furniture_metal_map m
  left join public.metal_components_stock s
    on s.metal_article = m.metal_article
  where m.is_active = true
    and trim(coalesce(m.furniture_article, '')) = trim(coalesce(p_furniture_article, ''))
  order by m.metal_article;
$$;

create or replace function public.web_get_metal_stock()
returns table (
  metal_article text,
  metal_name text,
  qty_available integer,
  qty_reserved integer,
  used_in_count bigint
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with usage_counts as (
    select
      m.metal_article,
      count(*)::bigint as used_in_count
    from public.furniture_metal_map m
    where m.is_active = true
    group by m.metal_article
  )
  select
    s.metal_article,
    s.metal_name,
    s.qty_available,
    s.qty_reserved,
    coalesce(u.used_in_count, 0)::bigint as used_in_count
  from public.metal_components_stock s
  left join usage_counts u on u.metal_article = s.metal_article
  order by s.metal_article;
$$;

create or replace function public.web_set_metal_stock(
  p_metal_article text,
  p_metal_name text,
  p_qty_available integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := trim(coalesce(p_metal_article, ''));
  v_name text := trim(coalesce(p_metal_name, ''));
  v_qty integer := greatest(coalesce(p_qty_available, 0), 0);
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'metal_article required';
  end if;

  insert into public.metal_components_stock (metal_article, metal_name, qty_available)
  values (v_article, coalesce(nullif(v_name, ''), v_article), v_qty)
  on conflict (metal_article) do update
  set metal_name = coalesce(nullif(excluded.metal_name, ''), public.metal_components_stock.metal_name),
      qty_available = excluded.qty_available,
      updated_at = now();
end;
$$;

grant execute on function public.web_get_metal_for_furniture(text) to anon, authenticated, service_role;
grant execute on function public.web_get_metal_stock() to anon, authenticated, service_role;
grant execute on function public.web_set_metal_stock(text, text, integer) to authenticated, service_role;
