create table if not exists public.furniture_product_map (
  id bigserial primary key,
  product_name text not null,
  section_name text,
  item_name_pattern text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint furniture_product_map_check
    check (
      coalesce(nullif(trim(section_name), ''), nullif(trim(item_name_pattern), '')) is not null
    )
);

create unique index if not exists ux_furniture_product_map_key
  on public.furniture_product_map (
    lower(trim(product_name)),
    coalesce(lower(trim(section_name)), ''),
    coalesce(lower(trim(item_name_pattern)), '')
  );

insert into public.furniture_product_map (product_name, section_name, item_name_pattern, sort_order)
values
  ('ТВ тумба', 'ТВ Лофт', null, 10),
  ('ТВ тумба 1500', 'ТВ Лофт 1500', null, 20),
  ('Донини', 'Donini 806', null, 30),
  ('Донини', 'Donini 750', null, 31),
  ('Донини Гранде', 'Donini Grande 806', null, 40),
  ('Донини Гранде', 'Donini Grande 750', null, 41),
  ('Авела Лайт', 'Avella lite', null, 50),
  ('Кремона', 'Cremona', null, 60),
  ('Примьера', 'Премьер черный', null, 70),
  ('Примьера', 'Премьер белый', null, 71),
  ('Стабиле', 'Stabile', null, 80),
  ('Донини R', 'Donini R 806', null, 90),
  ('Донини R', 'Donini R 750', null, 91),
  ('Siena', null, '%Siena%', 95),
  ('Солито 1350', 'Solito 1350 черный', null, 100),
  ('Солито 1350', 'Solito 1350 белый', null, 101),
  ('Solito2', 'Solito2', null, 110),
  ('Классико', 'Классико', null, 120),
  ('Классико', 'Классико +', null, 121),
  ('Солито 1150', 'Solito 1150', null, 130)
on conflict do nothing;

create or replace function public.web_get_furniture_product_articles()
returns table (
  product_name text,
  section_name text,
  article text,
  item_name text,
  table_color text,
  map_sort integer
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with active_map as (
    select
      trim(product_name) as product_name,
      nullif(trim(section_name), '') as section_name,
      nullif(trim(item_name_pattern), '') as item_name_pattern,
      sort_order
    from public.furniture_product_map
    where is_active = true
  ),
  by_section as (
    select
      m.product_name,
      m.section_name,
      iam.article,
      iam.item_name,
      iam.table_color,
      m.sort_order
    from active_map m
    join public.item_article_map iam
      on m.section_name is not null
     and iam.section_name = m.section_name
  ),
  by_pattern as (
    select
      m.product_name,
      coalesce(iam.section_name, '') as section_name,
      iam.article,
      iam.item_name,
      iam.table_color,
      m.sort_order
    from active_map m
    join public.item_article_map iam
      on m.item_name_pattern is not null
     and iam.item_name ilike m.item_name_pattern
  )
  select
    src.product_name,
    src.section_name,
    src.article,
    src.item_name,
    src.table_color,
    src.sort_order as map_sort
  from (
    select * from by_section
    union all
    select * from by_pattern
  ) src
  order by src.product_name, src.sort_order, src.item_name;
$$;

grant select on public.furniture_product_map to anon, authenticated, service_role;
grant execute on function public.web_get_furniture_product_articles() to anon, authenticated, service_role;
