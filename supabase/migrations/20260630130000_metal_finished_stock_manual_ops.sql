-- Ручное добавление и удаление позиций на складе готовой металлопродукции.

create or replace function public.web_add_metal_finished_manual(
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
  v_article text := upper(trim(coalesce(p_article, '')));
  v_qty     integer := coalesce(p_qty, 0);
  v_name    text;
  v_note    text := coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Ручное поступление');
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'article is required';
  end if;
  if v_qty <= 0 then
    raise exception 'qty must be positive';
  end if;

  select trim(coalesce(c.name, ''))
    into v_name
  from public.metal_product_catalog c
  where upper(trim(c.article)) = v_article
    and coalesce(c.is_active, true) = true
  limit 1;

  if coalesce(v_name, '') = '' then
    raise exception 'Артикул % не найден в каталоге металлообработки', v_article;
  end if;

  insert into public.metal_finished_stock (article, name, qty)
  values (v_article, v_name, v_qty)
  on conflict (article) do update
    set name = excluded.name,
        qty  = public.metal_finished_stock.qty + v_qty,
        updated_at = now();

  insert into public.metal_finished_moves (article, qty, move_type, note)
  values (v_article, v_qty, 'receipt', v_note);
end;
$$;

create or replace function public.web_delete_metal_finished_stock(
  p_article text,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_qty     integer := 0;
  v_note    text := coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Удаление позиции со склада');
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'article is required';
  end if;

  select coalesce(qty, 0)
    into v_qty
  from public.metal_finished_stock
  where article = v_article;

  if not found then
    raise exception 'Позиции % нет на складе готовой продукции', v_article;
  end if;

  if v_qty > 0 then
    insert into public.metal_finished_moves (article, qty, move_type, note)
    values (v_article, -v_qty, 'ship', v_note);
  end if;

  delete from public.metal_finished_stock
  where article = v_article;
end;
$$;

-- Поправка: при корректировке новой позиции подтягиваем название из каталога.
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
  v_article text := upper(trim(coalesce(p_article, '')));
  v_qty     integer := greatest(coalesce(p_qty, 0), 0);
  v_old     integer;
  v_delta   integer;
  v_name    text;
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'article is required';
  end if;

  select coalesce(qty, 0) into v_old
    from public.metal_finished_stock
    where article = v_article;

  if not found then
    select trim(coalesce(c.name, ''))
      into v_name
    from public.metal_product_catalog c
    where upper(trim(c.article)) = v_article
    limit 1;

    insert into public.metal_finished_stock (article, name, qty)
    values (v_article, coalesce(nullif(v_name, ''), v_article), v_qty);
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

grant execute on function public.web_add_metal_finished_manual(text, integer, text) to authenticated, service_role;
grant execute on function public.web_delete_metal_finished_stock(text, text) to authenticated, service_role;
