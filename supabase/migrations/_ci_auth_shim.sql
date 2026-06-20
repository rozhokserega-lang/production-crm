-- ============================================================================
-- CI ONLY — не применяется в Supabase. Применяется ДО BASELINE.sql при локальной
-- проверке миграций (scripts/verify_migrations_locally.ps1,
-- .github/workflows/migrations-ci.yml).
--
-- Назначение: доопределить серверное окружение Supabase, которое НЕ входит в
-- pg_dump (это серверные объекты, а не схема данных):
--   1. Расширение pgcrypto (для gen_random_uuid()) — есть в Supabase из коробки.
--   2. Схему auth с таблицей auth.users(id, email) — pg_dump BASELINE ссылается на
--      auth.uid() в defaults колонок и FK из crm_user_roles, но сам CREATE SCHEMA
--      auth не включает (считает, что схема уже есть, как в Supabase).
--   3. Роли anon / authenticated / service_role — на них GRANT в миграциях и BASELINE.
--   4. Функцию auth.uid() — используется в defaults колонок и RLS-политиках.
--
-- Предметная схема (таблицы/функции/views) приходит из BASELINE.sql целиком.
-- Применяется ДО BASELINE, т.к. BASELINE ссылается на auth.uid()/auth.users ещё
-- при CREATE TABLE (defaults).
--
-- В локальном скрипте перед auth-shim дропается public, поэтому здесь создаём
-- public минимально (pgcrypto-extension по умолчанию идёт в public).
-- ============================================================================

-- 0. Схема public НЕ создаётся здесь — её создаст BASELINE.sql в начале (CREATE
--    SCHEMA public). Локальный скрипт дропает public перед auth-shim, а BASELINE
--    пересоздаёт её сам. pgcrypto и auth ниже не зависят от public.

-- 1. Схема auth (нужна до BASELINE — там ссылки на auth.uid() в defaults колонок).
--    public ещё не существует (дропнут), поэтому auth ставим независимо.
create schema if not exists auth;

-- 2. pgcrypto: ставим в auth-схему (public ещё не существует). gen_random_uuid()
--    доступна по имени функции после CREATE EXTENSION независимо от схемы.
create extension if not exists pgcrypto with schema auth;
set search_path = auth, public;

-- 3. auth.users(id, email): BASELINE ссылается на auth.users (FK из crm_user_roles,
--    join в web_list_crm_user_roles). В CI строки не вставляются.
create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- 3. auth.uid(): Supabase GoTrue выставляет jwt claim и предоставляет эту функцию.
--    Возвращаем NULL — для CREATE TABLE ... DEFAULT auth.uid() и компиляции RLS-
--    политик этого достаточно. Политики в runtime CI не проверяются (нет jwt).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

-- 4. Роли Supabase. В Supabase создаются автоматически; миграции и BASELINE активно
--    используют `GRANT ... TO anon, authenticated, service_role`. В чистом Postgres
--    этих ролей нет → GRANT падает. Создаём как NOLOGIN.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $roles$;
