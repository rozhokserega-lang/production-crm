# Supabase Migrations Discipline

This directory is the single source of truth for database changes.

## Rules

1. Every DB change must be a new timestamped SQL file:
   - `YYYYMMDDHHMMSS_descriptive_name.sql`
2. Never edit an already applied migration.
3. Keep migration names aligned with applied DB migration names when possible.
4. All SQL files from `migration/` are considered legacy input and must be tracked in `MIGRATION_BACKFILL_PLAN.md` until migrated here.
5. Apply changes to database only from this directory after review.

## Safe rollout policy

1. Prepare migration in this folder.
2. Review SQL and run checks in staging.
3. Apply in staging.
4. Verify RPC/table/permission state.
5. Apply in production.

## Current status

- Legacy SQL exists in `migration/`.
- Backfill mapping plan is documented in `supabase/migrations/MIGRATION_BACKFILL_PLAN.md`.
- No runtime behavior changes are introduced by this documentation commit.

## CI: автоматическая проверка миграций поверх схемы прода

Каждый PR/push, затрагивающий `supabase/migrations/**` или `supabase/BASELINE.sql`,
проходит отдельный workflow `.github/workflows/migrations-ci.yml`.

### Подход (Вариант A)

CI воспроизводит **реальную схему прода** и проверяет, что миграции корректно
применяются поверх неё — не ломают существующие таблицы/views/функции.

Порядок наката:
1. **Postgres 17** (версия прода) в Docker.
2. `DROP SCHEMA public CASCADE` — очищаем дефолтную public.
3. `_ci_auth_shim.sql` — серверное окружение Supabase, **не входящее в pg_dump**:
   `pgcrypto`, схема `auth`, `auth.users`, `auth.uid()`, роли `anon`/`authenticated`/
   `service_role`. Применяется до BASELINE, т.к. BASELINE ссылается на `auth.uid()`
   в `DEFAULT` колонок. **Не применяется в Supabase** — только для CI/локальной проверки.
4. **`supabase/BASELINE.sql` целиком** — полный DDL прода (pg_dump v17). Применяется
   атомарно, как задумал pg_dump (с forward-refs через `check_function_bodies=off`).
5. **Все миграции** в хронологическом порядке (по таймстемпу в имени), в режиме
   **WARN-only** (без `ON_ERROR_STOP`).
6. **Smoke-check** — наличие ключевых объектов (`orders`, `shipment_plan_cells`,
   `crm_audit_log`, RPC `web_get_orders_all`, `web_audit_log_event`).

### WARN-only режим для миграций

Миграции, падающие на **историческом дрейфе** (например, `CREATE OR REPLACE VIEW`
с урезанным набором колонок, когда в проде view шире), пишут `WARNING` и
пропускаются — **CI не падает**. Это сознательное решение: строже (падать на любой
ошибке) — CI всегда красный, пока не закрыт весь дрейф; WARN-only остаётся полезным.

Статус CI = успех, если:
- BASELINE применился без ошибок;
- smoke-check прошёл (ключевые объекты на месте).

Дрейф затем закрывается новыми фикс-миграциями и со временем исчезает.

### Регенерация BASELINE.sql

BASELINE.sql — это `pg_dump` прода. Регенерируется при значимых изменениях схемы:

```powershell
docker run --rm postgres:17 pg_dump `
  "postgresql://postgres.nsdwypcbhmfseotclkrm:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" `
  --schema=public --schema-only --no-owner --no-privileges `
  > supabase/BASELINE.sql
```

Файл должен быть в **UTF-8 без BOM** (PowerShell `>` сохраняет в UTF-16 — конвертируйте).

### Локальный запуск

```powershell
./scripts/verify_migrations_locally.ps1
```

Требуется Docker Desktop. Поднимает Postgres 17 на порту 55432, накатывает тот же
стек (auth-shim → BASELINE → миграции в WARN-only) и выводит результат по каждой
миграции. Удобно для отладки до коммита.

### Что проверяет, а что нет

- ✅ Миграции корректно применяются к схеме прода (не ломают существующие объекты).
- ✅ Наличие ключевых таблиц/RPC после наката (smoke).
- ✅ Регистрирует исторический дрейф как WARNING (видно, какие миграции расходятся).
- ❌ RLS-политики в runtime (нужен smoke RPC от роли anon/authenticated — отдельная задача).
- ❌ Поведение при реальных JWT-claims (CI не выставляет jwt, `auth.uid()` → NULL).
- ❌ Fresh-install с нуля (часть объектов создаётся вручную в проде и не входит в миграции;
      поэтому CI использует BASELINE прода, а не накат миграций на пустую БД).
