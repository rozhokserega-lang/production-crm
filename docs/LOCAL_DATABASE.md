# Локальная БД CRM (полный офлайн-режим)

Три части: **данные с прода**, **Realtime**, **Edge Functions**.

## Быстрый старт (рекомендуется)

```powershell
# 1) Один раз: бэкап с облака + заливка в локальный Postgres
powershell -ExecutionPolicy Bypass -File scripts/local-db-sync-prod.ps1

# 2) Поднять стек + Edge Functions (два окна)
scripts/Start-CrmLocalDb.bat

# 3) Frontend на локальный API
copy fronted\.env.local-db.example fronted\.env.local
powershell -ExecutionPolicy Bypass -File scripts/start-local-dev.ps1
```

`local-db-sync-prod.ps1` нужен **SUPABASE_DB_URL** в `fronted/.env.local` (pooler Postgres, не anon key).

---

## 1. Данные (не пустые таблицы)

| Действие | Команда |
|----------|---------|
| Только сохранить дамп с прода | `scripts/local-db-backup-prod.ps1` |
| Дамп + restore в локальную БД | `scripts/local-db-sync-prod.ps1` |
| Restore уже сохранённого дампа | `scripts/local-db-restore.ps1 -DumpPath backups/local-db/....dump` |
| При старте подставить последний дамп | `scripts/local-db-up.ps1 -RestoreLatest` |

Дампы: `backups/local-db/*.dump` (в git не попадают).

**Регулярность:** 1–2 раза в неделю `local-db-sync-prod.ps1`, пока облако доступно.

Если после `local-db-up` видите предупреждение «orders is empty» — выполните sync или `-RestoreLatest`.

---

## 2. Realtime

В `docker-compose.local-db.yml` добавлен серvice **`realtime`** (образ `supabase/realtime`).

- Postgres поднимается с `wal_level=logical` (нужно для нового volume; если Realtime не стартует на старом volume — `docker compose -f docker-compose.local-db.yml down -v` и sync заново).
- После схемы накатывается `scripts/local-db/realtime-publication.sql` — publication `supabase_realtime` и те же таблицы, что в прод-миграции.
- Шлюз: **`ws://127.0.0.1:54321/realtime/v1/websocket`**
- В `fronted/.env.local` достаточно `VITE_SUPABASE_URL=http://127.0.0.1:54321` — клиент Supabase сам строит WebSocket.

Проверка: залогиниться локально, открыть цех/отгрузку — изменения с другой вкладки должны подтягиваться без F5 (как на проде).

---

## 3. Edge Functions

Functions **не в Docker** (так проще для всех 4 функций из `supabase/functions/`), а через **Supabase CLI**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-db-functions-serve.ps1
```

Порт **54322** на хосте; nginx в gateway проксирует **`http://127.0.0.1:54321/functions/v1/`** → `host.docker.internal:54322`.

Первый запуск создаёт `supabase/functions/.env.local` из `.env.local.example`.

| Function | Назначение в CRM |
|----------|------------------|
| `notify-assembly-ready` | Telegram при сборке/финале |
| `sync-materials-stock` | Google Sheet → склад |
| `sync-leftovers-sheet` | Остатки → Sheet |
| `log-consume-sheet` | Списание в Sheet |

Без `TELEGRAM_*` / Google-секретов вызовы могут падать — для офлайн-работы CRM это некритично (основное — RPC).

Флаг **`-WithFunctions`** у `local-db-up.ps1` / `Start-CrmLocalDb.bat` открывает окно с `functions serve`.

---

## Архитектура

```
localhost:5173  (Vite CRM)
       │
       ▼
127.0.0.1:54321  (nginx gateway)
   ├── /rest/v1/      → PostgREST
   ├── /auth/v1/      → GoTrue
   ├── /realtime/v1/  → Realtime (WebSocket)
   └── /functions/v1/ → host:54322 (supabase functions serve)

localhost:55432  Postgres (volume crm_local_pgdata)
```

---

## Вернуться на облако

Восстановите `fronted/.env.local` с `*.supabase.co` и (для dev) `VITE_SUPABASE_PROXY_URL=/supabase`.

---

## Ограничения

- Локальный стек **не подменяет** crm-v175.ru без отдельного деплоя на VPS.
- **Sync с прода** нагружает облачный Postgres (лучше ночью / редко).
- Первый `npx supabase functions serve` скачает CLI (~десятки MB).
