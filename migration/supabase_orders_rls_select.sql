-- Чтение заказов из фронта (anon key + PostgREST RPC).
-- Ошибка 42501 «permission denied for table orders» возникает, если:
--   • на orders включён RLS, но нет политики SELECT; и/или
--   • у ролей anon / authenticated нет GRANT SELECT на таблицу.
--
-- Выполнить в SQL Editor, если после миграций RPC падают с 42501.

grant select on public.orders to anon, authenticated;

drop policy if exists "orders_select_anon_authenticated" on public.orders;

create policy "orders_select_anon_authenticated"
  on public.orders
  for select
  to anon, authenticated
  using (true);
