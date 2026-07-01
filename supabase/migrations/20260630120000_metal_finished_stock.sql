-- ============================================================
-- Склад готовой металлической продукции (metal finished stock)
--   metal_finished_stock  — текущие остатки готовой продукции
--   metal_finished_moves  — журнал движений (приход/списание/корректировка)
--
-- Не путать с metal_components_stock — это склад СЫРЬЕВЫХ металлических
-- компонентов (фурнитуры). Здесь — склад ГОТОВЫХ изделий после производства.
--
-- Паттерн за основу: hardware_stock / hardware_moves.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Расширяем статус metal_work_items: добавляем 'stocked'
--    (позиция зачислена на склад готовой продукции, исчезает из «Готовых»)
-- ------------------------------------------------------------
alter table public.metal_work_items drop constraint if exists metal_work_items_status_check;
alter table public.metal_work_items
  add constraint metal_work_items_status_check
  check (status in ('planned', 'active', 'done', 'cancelled', 'split', 'stocked'));

-- ------------------------------------------------------------
-- 2. Таблицы склада готовой продукции
-- ------------------------------------------------------------
create table if not exists public.metal_finished_stock (
  article    text        not null references public.metal_product_catalog(article) on update cascade,
  name       text        not null,
  qty        integer     not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  constraint metal_finished_stock_pkey primary key (article)
);

comment on table public.metal_finished_stock is
  'Current stock balances for finished metal products (after production).';

create table if not exists public.metal_finished_moves (
  id                 bigserial   primary key,
  article            text        not null references public.metal_product_catalog(article) on update cascade,
  qty                integer     not null,
  move_type          text        not null default 'receipt'
    check (move_type in ('receipt', 'ship', 'adjust')),
  source_work_item_id bigint     null,
  note               text,
  created_at         timestamptz not null default now()
);

comment on table public.metal_finished_moves is
  'Stock movements for finished metal products (+receipt from production, -ship, adjust).';

-- Идемпотентность: одну done-позицию нельзя зачислить на склад дважды.
create unique index if not exists ux_metal_finished_moves_receipt_once
  on public.metal_finished_moves (source_work_item_id)
  where move_type = 'receipt' and source_work_item_id is not null;

create index if not exists idx_metal_finished_moves_article_created_at
  on public.metal_finished_moves (article, created_at desc);
create index if not exists idx_metal_finished_moves_created_at
  on public.metal_finished_moves (created_at desc);

-- ------------------------------------------------------------
-- 3. updated_at trigger для склада
-- ------------------------------------------------------------
create or replace function public.trg_metal_finished_stock_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_metal_finished_stock_touch_updated_at on public.metal_finished_stock;
create trigger tr_metal_finished_stock_touch_updated_at
before update on public.metal_finished_stock
for each row
execute function public.trg_metal_finished_stock_touch_updated_at();

-- ------------------------------------------------------------
-- 4. RLS + policies (select публичный, write — через RPC с проверкой ролей)
-- ------------------------------------------------------------
alter table public.metal_finished_stock enable row level security;
alter table public.metal_finished_moves enable row level security;

drop policy if exists "metal_finished_stock_select_public" on public.metal_finished_stock;
create policy "metal_finished_stock_select_public"
  on public.metal_finished_stock
  for select
  to anon, authenticated
  using (true);

drop policy if exists "metal_finished_moves_select_public" on public.metal_finished_moves;
create policy "metal_finished_moves_select_public"
  on public.metal_finished_moves
  for select
  to anon, authenticated
  using (true);

grant select on public.metal_finished_stock to anon, authenticated, service_role;
grant select on public.metal_finished_moves to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. RPC: зачислить готовую позицию на склад (по work_item_id)
--    — переводит metal_work_items.status 'done' -> 'stocked'
--    — увеличивает остаток по артикулу
--    — пишет движение receipt
--    — идемпотентно (unique index по source_work_item_id)
-- ------------------------------------------------------------
create or replace function public.web_receive_metal_finished(
  p_work_item_id bigint
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_item     record;
  v_article  text;
  v_name     text;
  v_qty      integer;
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if p_work_item_id is null or p_work_item_id <= 0 then
    raise exception 'work_item_id is required';
  end if;

  select article, name, qty, status
    into v_item
    from public.metal_work_items
    where id = p_work_item_id;

  if not found then
    raise exception 'Позиция производства не найдена (id=%)', p_work_item_id;
  end if;

  if v_item.status <> 'done' then
    raise exception 'Зачислить на склад можно только готовую позицию (текущий статус: %)', v_item.status;
  end if;

  v_article := trim(coalesce(v_item.article, ''));
  v_name    := trim(coalesce(v_item.name, ''));
  v_qty     := greatest(coalesce(v_item.qty, 0), 0);

  if v_article = '' then
    raise exception 'У позиции производства пустой артикул';
  end if;
  if v_qty <= 0 then
    raise exception 'Количество к зачислению должно быть больше 0';
  end if;

  -- Идемпотентность: если движение receipt уже есть — не дублируем.
  if exists (
    select 1 from public.metal_finished_moves m
    where m.move_type = 'receipt'
      and m.source_work_item_id = p_work_item_id
  ) then
    raise exception 'Эта позиция уже зачислена на склад';
  end if;

  -- upsert остатка
  insert into public.metal_finished_stock (article, name, qty)
  values (v_article, v_name, v_qty)
  on conflict (article) do update
    set name = excluded.name,
        qty  = public.metal_finished_stock.qty + v_qty,
        updated_at = now();

  -- журнал движения
  insert into public.metal_finished_moves (article, qty, move_type, source_work_item_id, note)
  values (v_article, v_qty, 'receipt', p_work_item_id, 'Зачислено с производства');

  -- переводим позицию производства в 'stocked'
  update public.metal_work_items
    set status = 'stocked',
        updated_at = now()
    where id = p_work_item_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. RPC: список остатков склада готовой продукции
-- ------------------------------------------------------------
create or replace function public.web_list_metal_finished_stock()
returns table (
  article    text,
  name       text,
  qty        integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    s.article,
    s.name,
    s.qty,
    s.updated_at
  from public.metal_finished_stock s
  order by s.article;
$$;

-- ------------------------------------------------------------
-- 7. RPC: журнал движений
-- ------------------------------------------------------------
create or replace function public.web_list_metal_finished_moves(
  p_limit integer default 300
)
returns table (
  id                  bigint,
  article             text,
  name                text,
  qty                 integer,
  move_type           text,
  source_work_item_id bigint,
  note                text,
  created_at          timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select
    m.id,
    m.article,
    coalesce(s.name, m.article) as name,
    m.qty,
    m.move_type,
    m.source_work_item_id,
    m.note,
    m.created_at
  from public.metal_finished_moves m
  left join public.metal_finished_stock s on s.article = m.article
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
$$;

-- ------------------------------------------------------------
-- 8. RPC: списание со склада (отгрузка/продажа)
-- ------------------------------------------------------------
create or replace function public.web_ship_metal_finished(
  p_article text,
  p_qty     integer,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := trim(coalesce(p_article, ''));
  v_qty     integer := coalesce(p_qty, 0);
  v_on_hand integer;
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'article is required';
  end if;
  if v_qty <= 0 then
    raise exception 'qty to ship must be positive';
  end if;

  select coalesce(qty, 0) into v_on_hand
    from public.metal_finished_stock
    where article = v_article;

  if v_on_hand is null then
    raise exception 'Артикула % нет на складе готовой продукции', v_article;
  end if;
  if v_qty > v_on_hand then
    raise exception 'Недостаточно на складе: есть %, списываем %', v_on_hand, v_qty;
  end if;

  update public.metal_finished_stock
    set qty = qty - v_qty,
        updated_at = now()
    where article = v_article;

  insert into public.metal_finished_moves (article, qty, move_type, note)
  values (v_article, -v_qty, 'ship', coalesce(nullif(trim(p_note), ''), 'Списание со склада'));
end;
$$;

-- ------------------------------------------------------------
-- 9. RPC: корректировка остатка (инвентаризация / правка)
-- ------------------------------------------------------------
create or replace function public.web_adjust_metal_finished_stock(
  p_article text,
  p_qty     integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := trim(coalesce(p_article, ''));
  v_qty     integer := greatest(coalesce(p_qty, 0), 0);
  v_old     integer;
  v_delta   integer;
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'article is required';
  end if;

  select coalesce(qty, 0) into v_old
    from public.metal_finished_stock
    where article = v_article;

  if not found then
    -- создаём строку с абсолютным значением
    insert into public.metal_finished_stock (article, qty)
    values (v_article, v_qty);
    v_delta := v_qty;
  else
    update public.metal_finished_stock
      set qty = v_qty,
          updated_at = now()
      where article = v_article;
    v_delta := v_qty - v_old;
  end if;

  if v_delta <> 0 then
    insert into public.metal_finished_moves (article, qty, move_type, note)
    values (v_article, v_delta, 'adjust', 'Корректировка остатка');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 10. Grants на RPC
-- ------------------------------------------------------------
grant execute on function public.web_receive_metal_finished(bigint) to authenticated, service_role;
grant execute on function public.web_list_metal_finished_stock() to anon, authenticated, service_role;
grant execute on function public.web_list_metal_finished_moves(integer) to anon, authenticated, service_role;
grant execute on function public.web_ship_metal_finished(text, integer, text) to authenticated, service_role;
grant execute on function public.web_adjust_metal_finished_stock(text, integer) to authenticated, service_role;
