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

## CI: автоматическая проверка миграций на чистом Postgres

Каждый PR/push, затрагивающий `supabase/migrations/**` или `SUPABASE_STAGE1_SCHEMA.sql`,
проходит отдельный workflow `.github/workflows/migrations-ci.yml`: поднимается чистый
`postgres:15-alpine`, и весь стек накатывается в хронологическом порядке. Это ловит
невалидный SQL, рассинхрон порядка применения и конфликты имён **до прода**.

Поскольку миграции рассчитаны на окружение Supabase (функция `auth.uid()`, таблица
`auth.users`, роли `anon`/`authenticated`/`service_role`, расширение `pgcrypto`),
перед миграциями применяется `_ci_auth_shim.sql` — он эмулирует это окружение
заглушками. **Этот файл не применяется в Supabase**, он нужен только для CI/локальной
проверки.

Порядок применения:
1. `_ci_auth_shim.sql` — эмуляция Supabase auth окружения.
2. `../../SUPABASE_STAGE1_SCHEMA.sql` — базовые таблицы (`orders`, `shipment_plan_cells`,
   `labor_facts`) и первичные RPC. Идут **до** миграций, т.к. первая миграция делает
   `alter table public.orders`.
3. `*.sql` в этом каталоге (кроме `_ci_auth_shim.sql`) — по таймстемпу в имени файла.

### Локальный запуск

```bash
./scripts/verify_migrations_locally.sh
```

Требуется локальный Docker. Поднимает Postgres на порту 55432, накатывает тот же
стек и выводит результат по каждой миграции. Удобно для отладки до коммита.

### Что проверяет, а что нет

- ✅ Валидность SQL-синтаксиса всех миграций.
- ✅ Корректный порядок применения (зависимости между миграциями).
- ✅ Отсутствие конфликтов имён объектов.
- ✅ Наличие ключевых таблиц/RPC после наката (smoke).
- ❌ RLS-политики в runtime (для этого нужен smoke RPC от роли anon/authenticated —
      отдельная задача).
- ❌ Поведение при реальных JWT-claims (CI не выставляет jwt, поэтому `auth.uid()`
      возвращает NULL).
