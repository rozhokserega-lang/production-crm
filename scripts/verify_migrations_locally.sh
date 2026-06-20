#!/usr/bin/env bash
# ============================================================================
# Локальная проверка всех миграций на чистом Postgres через Docker.
# Цель: поймать невалидный SQL / рассинхрон порядка / конфликты имён до прода.
#
# Порядок применения:
#   1. _ci_auth_shim.sql        — эмуляция Supabase auth окружения (pgcrypto, auth.users, auth.uid)
#   2. SUPABASE_STAGE1_SCHEMA.sql — базовые таблицы (orders, shipment_plan_cells, labor_facts)
#   3. supabase/migrations/*.sql — все миграции по таймстемпу в имени файла
#
# Запуск:
#   ./scripts/verify_migrations_locally.sh
#
# Требования: локально установлен Docker.
# Выход: код 0 — все миграции наложились; ненулевой — есть проблема (см. вывод).
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER_NAME="crm-migrations-check"
POSTGRES_IMAGE="postgres:15-alpine"
DB_NAME="crm_ci"
DB_USER="postgres"
DB_PASSWORD="ci_password"
DB_PORT="55432"

# Цветной вывод для терминала; в CI остаётся читаемым и без цвета.
say() { printf '\n\033[1;36m[migrations-check]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[migrations-check] ERROR:\033[0m %s\n' "$*" >&2; }

cleanup() {
  say "Останавливаю контейнер $CONTAINER_NAME..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 1. Проверка наличия Docker.
if ! command -v docker >/dev/null 2>&1; then
  err "Docker не найден. Установите Docker и повторите."
  exit 1
fi

# 2. Запуск чистого Postgres.
say "Запускаю $POSTGRES_IMAGE (порт $DB_PORT)..."
cleanup
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -p "$DB_PORT:5432" \
  "$POSTGRES_IMAGE" >/dev/null

# 3. Ожидание готовности Postgres.
say "Жду, пока Postgres поднимется..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    say "Postgres готов."
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "Postgres не поднялся за 30 секунд."
    exit 1
  fi
  sleep 1
done

# 4. Накат файлов в правильном порядке. Каждый файл — отдельный psql -v ON_ERROR_STOP=1,
#    чтобы при ошибке сразу получить имя файла и контекст, а не каскад.
apply_sql() {
  local label="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    err "Файл не найден: $file"
    exit 1
  fi
  say "Применяется $label: $(basename "$file")"
  if ! docker exec -i "$CONTAINER_NAME" psql \
    -v ON_ERROR_STOP=1 \
    -U "$DB_USER" -d "$DB_NAME" < "$file"; then
    err "ОШИБКА в файле: $file"
    exit 1
  fi
}

# 4a. Сначала auth-shim (эмуляция Supabase окружения).
apply_sql "auth-shim" "$REPO_ROOT/supabase/migrations/_ci_auth_shim.sql"

# 4b. Базовые таблицы (orders и т.д.) — вне migrations/, идут самыми первыми.
apply_sql "stage1-schema" "$REPO_ROOT/SUPABASE_STAGE1_SCHEMA.sql"

# 4c. Все миграции по таймстемпу в имени. Сортировка строк с ведущим числом даёт
#     хронологический порядок. _ci_auth_shim.sql отсекаем явно (он уже применён).
say "Накатываю миграции в хронологическом порядке..."
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
count=0
failed=""
while IFS= read -r f; do
  base="$(basename "$f")"
  # Пропускаем служебный shim и немиграционные .md/.txt.
  case "$base" in
    _ci_auth_shim.sql) continue ;;
    *.md|*.txt) continue ;;
  esac
  count=$((count + 1))
  if ! docker exec -i "$CONTAINER_NAME" psql \
    -v ON_ERROR_STOP=1 \
    -U "$DB_USER" -d "$DB_NAME" < "$f" >/dev/null; then
    err "ОШИБКА в миграции: $base"
    failed="$failed\n  - $base"
    exit 1
  fi
  printf '  ✓ %s\n' "$base"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

say "Успешно применено миграций: $count"

# 5. Дымовая проверка: ключевые таблицы/RPC существуют.
say "Дымовая проверка наличия ключевых объектов..."
read -r orders shipment audit rpc_orders rpc_audit < <(
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -A -F' ' <<'SQL'
    select
      (select count(*) from information_schema.tables where table_schema='public' and table_name='orders')::text,
      (select count(*) from information_schema.tables where table_schema='public' and table_name='shipment_plan_cells')::text,
      (select count(*) from information_schema.tables where table_schema='public' and table_name='crm_audit_log')::text,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='web_get_orders_all')::text,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='web_audit_log_event')::text;
SQL
)
ok=1
[ "${orders:-0}" -eq 1 ] || { err "Нет таблицы public.orders"; ok=0; }
[ "${shipment:-0}" -eq 1 ] || { err "Нет таблицы public.shipment_plan_cells"; ok=0; }
[ "${audit:-0}" -eq 1 ] || { err "Нет таблицы public.crm_audit_log"; ok=0; }
[ "${rpc_orders:-0}" -ge 1 ] || { err "Нет RPC web_get_orders_all"; ok=0; }
[ "${rpc_audit:-0}" -ge 1 ] || { err "Нет RPC web_audit_log_event"; ok=0; }
if [ "$ok" -ne 1 ]; then exit 1; fi

say "\033[1;32m✓ Все миграции наложились cleanly.\033[0m ($count файлов + shim + stage1)"
