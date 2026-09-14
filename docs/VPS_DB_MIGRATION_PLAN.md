# Переезд БД CRM с Supabase Cloud на свой VPS

Цель: `crm-v175.ru` работает полностью на своём сервере, без Supabase Cloud.
Основа — уже рабочий `docker-compose.local-db.yml` (Postgres 17 + PostgREST + GoTrue + Realtime + nginx-шлюз).
Переезд = тот же стек на VPS, но с настоящими секретами, TLS, своими бэкапами.

Статус: **план, не выполнен.**

---

## 0. Что переезжает

| Компонент | Сейчас (Cloud) | После (VPS) |
|---|---|---|
| Postgres | `nsdwypcbhmfseotclkrm` | контейнер `crm-local-postgres` |
| REST API (RPC) | Supabase REST | PostgREST v12 |
| Auth | Supabase Auth | GoTrue v2.167 |
| Realtime | Supabase Realtime | `supabase/realtime` v2.34 |
| Edge Functions | Supabase Functions | `supabase functions serve` под systemd |
| Storage | **не используется** | — |
| Бэкапы | управляемые + PITR | свой `pg_dump` по cron |
| Dashboard / advisors / логи | есть | **теряем** |

### Проверено на проде (факты, а не предположения)

- База **29 МБ**, 51 таблица, **242** функции в `public`.
- Расширения установлены только: `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql`.
  **Нет** `pg_cron`, `pg_net`, PostGIS, `vector`. `vault` в коде не используется (нет упоминаний в `BASELINE.sql`).
  `pgcrypto` и `uuid-ossp` есть в официальном образе `postgres:17`.
- **Storage не используется** — ни одного обращения к `.storage` в `fronted/src`.
- `auth.users` — **10** записей, схема стандартная GoTrue (`encrypted_password` = bcrypt, переносим).
- `public.crm_user_roles` — **8** записей: 2 × `admin`, по 1 × `manager`, `planner`, `warehouse`, `operator`, `operator_pilka`, `operator_kromka`. Осиротевших строк нет.
- **FK `crm_user_roles.user_id → auth.users.id` существует** (`crm_user_roles_user_id_fkey`).
  Проверено репетицией, см. раздел 11. Через `information_schema` он не виден из-за прав на схему `auth` —
  смотреть надо в `pg_constraint`. Отсюда жёсткое требование к порядку шагов: **пользователей заливать
  раньше, чем `public`**, иначе констрейнт молча не создастся.
- **`crm_auth_strict` уже включён** (`web_is_crm_auth_strict() = true`, настройка в `public.crm_runtime_settings`).
  Аноним без JWT получает `viewer`, ветка с `admin` недостижима. На новом сервере это нужно
  не «включить», а **проверить, что значение перенеслось вместе с дампом**.
- `scripts/local-db-backup-on-vps.sh` дампит **только `--schema=public`** → пользователей надо переносить отдельным шагом.
  В `scripts/local-db-backup-prod.ps1` для этого добавлен флаг `-IncludeAuth`.

### Что перестаёт быть проблемой

Квота egress (5 ГБ/мес) исчезает. Опрос цеха раз в 120 с перестаёт стоить денег, но по-прежнему грузит VPS — отдельный вопрос оптимизации, к переезду не относится.

---

## 1. Фаза 0. Подготовка (без влияния на прод)

- [ ] Проверить ресурсы VPS: свободная RAM ≥ 2 ГБ (Realtime на Elixir — самый тяжёлый), диск ≥ 10 ГБ под данные и дампы.
- [ ] Убедиться, что Docker и Docker Compose v2 на VPS живы: `docker run --rm hello-world`, `docker compose version`.
- [ ] Выбрать адрес API. Вариант по умолчанию — поддомен `api.crm-v175.ru` (в `README_DEPLOY_STAGING.md` уже был похожий `supabase-proxy.crm-v175.ru`).
- [ ] Выпустить TLS-сертификат на выбранный адрес (certbot).
- [ ] Сгенерировать **новый** JWT-секрет:
      `openssl rand -base64 48`
- [ ] Сгенерировать `anon` и `service_role` ключи этим секретом (см. приложение А).
- [ ] Сгенерировать сильный пароль Postgres и `SECRET_KEY_BASE` для Realtime (`openssl rand -hex 32`).
- [ ] Сложить всё в `/opt/apps/production-crm/.env.local-db` на VPS, права `600`, владелец root.

> **Важно.** В `docker-compose.local-db.yml` секреты заданы как значения по умолчанию
> (`LOCAL_JWT_SECRET=super-secret-jwt-token-...`, `LOCAL_DB_PASSWORD=local_crm_dev`),
> а в `fronted/.env.local` лежит общеизвестный демо-anon-ключ.
> На локалхосте это нормально. На VPS с публичным API — **нет**: зная секрет,
> кто угодно подпишет себе `service_role`-токен и получит полный доступ к базе.
> Дефолты обязательно переопределить через env-файл.

---

## 2. Фаза 1. Стек на VPS рядом с облаком (прод не трогаем)

Поднимаем всё на непубличном порту и проверяем, пока `crm-v175.ru` продолжает работать на облаке.

- [ ] На VPS: `cd /opt/apps/production-crm && git fetch && git checkout crm && git pull`.
- [ ] Правки compose для прод-режима (см. раздел 8):
      - Postgres слушает только `127.0.0.1:55432`, не `0.0.0.0`.
      - Шлюз слушает `127.0.0.1:54321`; наружу — только через внешний nginx с TLS.
      - `GOTRUE_DISABLE_SIGNUP: "true"`.
      - `GOTRUE_SITE_URL` / `GOTRUE_URI_ALLOW_LIST` → `https://crm-v175.ru`.
      - `PGRST_SERVER_CORS_ALLOWED_ORIGINS` → `https://crm-v175.ru` (localhost убрать).
- [ ] Поднять стек: `docker compose --env-file .env.local-db -f docker-compose.local-db.yml up -d`.
- [ ] Проверить, что порт Postgres не виден снаружи: `ss -tlnp | grep 55432` → только `127.0.0.1`.
- [ ] `curl -s http://127.0.0.1:54321/` → JSON `{"status":"crm-local-api",...}`.

---

## 3. Фаза 2. Схема и данные

> **Не собирать базу из миграций.** В репозитории осознанный дрейф истории
> (`supabase/migrations/README.md`, `RECONCILIATION_DRIFT.md`), CI по миграциям
> работает в режиме WARN-only. Накат с нуля не гарантирован.
> Источник правды — `pg_dump` прода.

- [ ] Свежий дамп `public` с облака (на VPS это уже отлажено):
      `scripts/local-db-backup-on-vps.sh /root/backups/crm-prod-cutover.dump`
      (нужны `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` от облачного проекта).
- [ ] Проверить дамп: размер > 0, `pg_restore --list` читается.
- [ ] Залить в новый Postgres:
      `pg_restore --no-owner --no-privileges -d postgres /tmp/crm-restore.dump`
      (логика та же, что в `scripts/local-db-restore.ps1`).
- [ ] Накатить publication для Realtime: `scripts/local-db/realtime-publication.sql`.
- [ ] Сверить контрольные числа с продом:

```sql
select count(*) from public.orders;              -- на 11.09.2026 было 739
select count(*) from public.shipment_plan_cells; -- на 11.09.2026 было 701
select count(*) from public.crm_user_roles;      -- ожидаем 8
select count(*) from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE';   -- 51
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public';                                   -- 242
```

- [ ] Проверить, что ключевые RPC существуют и отвечают: `web_get_orders_all`, `web_get_shipment_board`, `web_get_orders_shipped`, `web_get_my_role`.

---

## 4. Фаза 3. Пользователи и вход (самый тонкий шаг)

Дамп берёт только `public`, поэтому `auth` переносится отдельно.
Роли CRM ищутся по `auth.uid()` в `crm_user_roles`, **UUID обязаны совпасть** — иначе все станут `viewer`.

> **Порядок важнее, чем кажется.** Из-за FK `crm_user_roles_user_id_fkey`
> пользователей нужно залить **до** restore `public`. Если сделать наоборот,
> данные встанут нормально, а вот констрейнт создать не удастся: `pg_restore`
> напишет одну строку в stderr и завершится успешно. База будет выглядеть целой,
> но без FK — тихий дрейф схемы относительно прода. Проверено репетицией (раздел 11).
> Если порядок всё же нарушен, констрейнт добавляется вручную после загрузки users:
>
> ```sql
> alter table public.crm_user_roles
>   add constraint crm_user_roles_user_id_fkey
>   foreign key (user_id) references auth.users(id) on delete cascade;
> ```

Порядок именно такой:

- [ ] Дать GoTrue стартовать на **пустой** базе `auth`, чтобы он накатил свои миграции сам.
      Схему `auth` руками не создавать. `supabase/migrations/_ci_auth_shim.sql` — **только для CI**,
      он делает фальшивую `auth.users(id, email)`; на рабочем сервере она не нужна.
- [ ] Снять с облака 10 пользователей (только нужные колонки):

```bash
pg_dump "$CLOUD_DB_URL" --data-only --schema=auth --table=auth.users --table=auth.identities \
  --format=plain --no-owner --no-privileges > auth-users.sql
```

- [ ] Вставить в новую базу, сохраняя `id`, `email`, `encrypted_password`, `email_confirmed_at`,
      `raw_app_meta_data`, `raw_user_meta_data`. bcrypt-хеши переносимы между версиями GoTrue,
      поэтому **пароли у людей останутся прежними**.
### Вариант Б: создать пользователей заново (согласовано 11.09.2026)

Заказчик подтвердил, что **сохранять существующие пароли не обязательно** — можно создать
логины заново. Это снимает главный риск Фазы 3: не нужно переносить строки `auth` между
разными версиями GoTrue. Но появляются два следствия, оба некритичные, если их не забыть.

**1. Роли придётся назначить вручную.** В `public.crm_user_roles` нет email — только `user_id` (UUID).
У новых пользователей UUID будут другие, поэтому строки из дампа укажут «в никуда».
Восстановить связь можно двумя способами:

- назначить 8 ролей через интерфейс администратора (`web_set_crm_user_role`) — это
  **2 × `admin`** и по одной `manager`, `planner`, `warehouse`, `operator`, `operator_pilka`, `operator_kromka`;
- либо вытащить соответствие «старый UUID → email» из дампа `crm-prod-auth-*.sql`
  и перепривязать по email:

```sql
update public.crm_user_roles r
set user_id = u.id
from auth.users u
where u.email = :email and r.user_id = :old_uuid;
```

**2. Констрейнт `crm_user_roles_user_id_fkey` не создастся** — по той же причине, что описана выше:
старые UUID не найдутся в новой `auth.users`. Порядок такой: создать пользователей →
восстановить `public` → **удалить устаревшие строки ролей** → назначить роли заново →
добавить FK вручную:

```sql
delete from public.crm_user_roles r
where not exists (select 1 from auth.users u where u.id = r.user_id);

alter table public.crm_user_roles
  add constraint crm_user_roles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
```

- [ ] Проверить, что ролей снова **8** и осиротевших строк нет.
- [ ] Раздать новые пароли людям (10 учёток, из них 8 с ролями; 2 без роли — можно не создавать).

> При этом варианте `-IncludeAuth`-дамп всё равно стоит хранить: он единственный
> источник соответствия «UUID → email → роль» на случай спорных ситуаций.

- [ ] Проверить: `select count(*) from public.crm_user_roles r join auth.users u on u.id = r.user_id;` → **8**.
- [ ] Войти каждой ролью (минимум: admin, manager, warehouse, operator_pilka) и убедиться,
      что `web_get_my_role` отдаёт ожидаемое.

### Проверить строгий режим до открытия наружу

`web_effective_crm_role()` при **выключенном** `crm_auth_strict` отдаёт `admin`, когда сессии нет.
В проде режим **уже включён**, и значение приезжает вместе с дампом `public`
(таблица `crm_runtime_settings`). То есть включать не нужно — нужно убедиться, что не потерялось.

- [ ] `select public.web_is_crm_auth_strict();` → ожидаем **`true`**.
- [ ] `select public.web_effective_crm_role();` без JWT → ожидаем **`viewer`**.
- [ ] Проверить анонимом: `curl` к `/rest/v1/rpc/web_get_my_role` без токена не должен давать админские данные.
- [ ] Если по какой-то причине `false` — включить: `select public.web_set_crm_auth_strict(true);`

---

## 5. Фаза 4. Edge Functions

Четыре функции в `supabase/functions/`. Из фронта вызываются только две
(`notify-assembly-ready`, `sync-materials-stock` — см. `fronted/src/app/edgeSyncService.js`).

- [ ] Установить Supabase CLI или Deno на VPS.
- [ ] Создать `supabase/functions/.env` с **новыми** ключами (`SUPABASE_URL=http://127.0.0.1:54321`,
      новые `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) плюс `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
      и секреты Google для sheet-функций.
- [ ] Завести **systemd-юнит** вместо окна PowerShell: `functions serve` на порту `54322`, `Restart=always`.
      Сейчас это `scripts/local-db-functions-serve.ps1`, то есть ручной запуск — для прода не годится.
- [ ] Шлюз уже проксирует `/functions/v1/` на `host.docker.internal:54322` — проверить, что попадает в systemd-процесс.
- [ ] Проверить Telegram-уведомление на тестовой сборке.

---

## 6. Фаза 5. Приёмка (до переключения людей)

Собрать фронт с новым API-адресом в отдельный каталог (например `/var/www/crm-vps-test`) и прогнать вживую:

- [ ] Вход и выход, обновление страницы не теряет сессию.
- [ ] Роли: оператор не видит админских действий.
- [ ] Цех: запуск/пауза/готово на пиле, кромке, прессе.
- [ ] Отгрузка: план, отправка в работу, возврат в ожидание.
- [ ] Склад: списание, остатки, «Что приедет».
- [ ] **Realtime**: две вкладки, изменение в одной видно во второй без F5.
- [ ] Печать: лист цеха, план, обвязка.
- [ ] Edge: уведомление в Telegram.
- [ ] Нагрузка: открыть табло `floorMap` на час, посмотреть `docker stats` и рост логов.

---

## 7. Фаза 6. Переключение и откат

### Переключение

- [ ] Выбрать окно (вечер, цех не работает).
- [ ] Финальный дамп `public` с облака — **это и есть точка отката** (см. ниже).
- [ ] Долить свежие данные в VPS (`--data-only`), чтобы не потерять правки дня.
- [ ] Поменять `fronted/.env.production`: `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` на новые.
- [ ] Обновить `EXPECTED_SUPABASE_URL` в `scripts/deploy-frontend-vps.sh` (иначе деплой упадёт на проверке).
- [ ] Задеплоить: `REQUIRE_PROXY=1 ./scripts/deploy-frontend-vps.sh`.
- [ ] Прогнать сокращённую приёмку из раздела 6 на живом домене.
- [ ] **Облачный проект не удалять** и не выключать минимум 2 недели.

### Точка отката

**До первой записи в VPS-базу** откат тривиален:

1. Вернуть прежние `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` в `fronted/.env.production`.
2. Вернуть прежний `EXPECTED_SUPABASE_URL` в `scripts/deploy-frontend-vps.sh`.
3. `./scripts/deploy-frontend-vps.sh` — фронт снова смотрит в облако.

Время: минуты. Данные не расходятся, потому что облако осталось нетронутым.

**После того как в цеху начали писать в VPS** простого отката уже нет: появляются
изменения, которых нет в облаке. Тогда откат — это обратная миграция:

1. `pg_dump --schema=public` с VPS.
2. `pg_restore` в облачный проект (перезатирая `public`).
3. Вернуть env и задеплоить.

Поэтому: **не переключать людей, пока не пройдена приёмка из раздела 6**, и держать
в голове, что после первого рабочего дня на VPS возврат стоит уже не минуты.

---

## 8. Что поправить в репозитории

- [ ] `docker-compose.local-db.yml` — прод-профиль (или отдельный `docker-compose.vps.yml`):
      биндинг на `127.0.0.1`, обязательные секреты без дефолтов, `GOTRUE_DISABLE_SIGNUP=true`,
      CORS только на `https://crm-v175.ru`.
- [ ] `scripts/deploy-frontend-vps.sh` — `EXPECTED_SUPABASE_URL` на новый адрес.
- [ ] `fronted/.env.production` — новые URL и anon-ключ.
- [ ] `fronted/.env.local` и `supabase/migrations/README.md` — строки подключения на VPS вместо pooler облака.
- [ ] Новый скрипт бэкапа **на** VPS (нынешний `local-db-scheduled-backup.ps1` тянет *из* облака —
      направление разворачивается).
- [ ] `docs/LOCAL_DATABASE.md` — раздел «Вернуться на облако» станет неактуальным, дописать про VPS как прод.

---

## 9. После переезда: то, что раньше делал Supabase

- [ ] **Бэкапы.** `pg_dump` по cron на VPS + копия **вне сервера** (домашний ПК или другой хост).
      Без этого один сбой диска = потеря базы: управляемых бэкапов и PITR больше нет.
- [ ] **Проверка восстановления.** Раз в месяц реально поднять дамп в отдельный контейнер и открыть данные.
      Непроверенный бэкап бэкапом не считается.
- [ ] **Мониторинг.** Минимум: живость `/rest/v1/`, свободное место, `docker stats`.
      Dashboard, advisors и логов Supabase больше нет.
- [ ] **Ротация логов** контейнеров (`json-file` с `max-size`), иначе диск съедят логи Realtime.
- [ ] **Обновления** Postgres / GoTrue / Realtime теперь ваши; фиксировать теги образов, не `latest`.

## 10. Вывод из эксплуатации облака (через 2+ недели)

- [ ] Убедиться, что VPS-бэкапы собираются и восстанавливаются.
- [ ] Скачать финальный дамп облака в архив.
- [ ] **Сменить пароль облачной БД** — он лежит в открытом виде в `fronted/.env.local`
      и `fronted/.env.local.cloud.bak` (файлы в git не попадают, но пароль давно «походил» по машинам).
- [ ] Удалить или заморозить проект `nsdwypcbhmfseotclkrm`.

---

## 11. Репетиция на локальном стеке (выполнена 11.09.2026)

Фазы 2–3 прогнаны в отдельной базе `crm_rehearsal` внутри `crm-local-postgres`,
рабочий локальный стек не тронут. Сценарий повторял чистый сервер:
схема `auth` от GoTrue → restore дампа `public` → загрузка пользователей.

**Дампы, на которых проверялось** (`scripts/local-db-backup-prod.ps1 -IncludeAuth`):

| Файл | Содержимое |
|---|---|
| `crm-prod-20260911-162421.dump` | `public`, 1.1 МБ, 51 таблица с данными, 245 объектов-функций |
| `crm-prod-auth-20260911-162421.sql` | 10 × `auth.users`, 10 × `auth.identities` |

**Результат: перенос работает.** После restore в базе 51 таблица и 242 функции —
ровно как в проде. Данные: 739 заказов, 701 ячейка плана, 8 ролей.
Пользователи встали без единой ошибки, все 8 ролей связались с реальными UUID,
осиротевших строк нет, распределение совпало с продом (2 × `admin`, по 1 остальных).

RPC отвечают на восстановленной базе:

| RPC | Строк |
|---|---|
| `web_get_orders_all` | 739 |
| `web_get_orders_shipped` | 244 |
| `web_get_warehouse_kit_orders` | 456 |
| `web_get_order_stats` | 739 |
| `web_get_shipment_board` | 1 (агрегат) |

**Что репетиция нашла:**

1. **FK создаётся только при правильном порядке шагов.** При restore `public` на пустой `auth`
   данные (8 ролей) встают нормально, но `crm_user_roles_user_id_fkey` не создаётся:
   `pg_restore` пишет `violates foreign key constraint` в stderr и **завершается успешно**.
   Итог — база без констрейнта, и заметить это можно только явной проверкой `pg_constraint`.
   Отсюда правило из раздела 4: пользователи раньше `public`.
2. **`crm_auth_strict` уже `true`** и переносится вместе с дампом. Аноним получает `viewer`.
3. **Схема `extensions` не нужна.** Ни одна функция `public` на неё не ссылается (проверено
   через `pg_get_functiondef`), хотя в проде `pgcrypto` и `uuid-ossp` установлены именно туда.
4. **Хелперы `auth.uid()`, `auth.role()`, `auth.jwt()` нужно создавать отдельно.**
   Их предоставляет Supabase, а не GoTrue, и в `pg_dump` схемы `public` они не попадают.
   В репетиции они были только потому, что схема `auth` копировалась из локальной базы,
   где отработал `_ci_auth_shim.sql`. На чистом сервере их надо добавить **до** restore `public`:
   - **6 колонок** в `public` объявлены с `DEFAULT auth.uid()` (`labor_kits.created_by`,
     `metal_work_queue.created_by`, `replacement_orders.created_by` и др.) — без функции
     упадёт уже `CREATE TABLE`;
   - **91 RLS-политика** в `public` опирается на эти же функции.

   При этом сам шим для сервера не годится: он делает фальшивую `auth.users(id, email)`,
   которая конфликтует с настоящей схемой GoTrue. Нужны только функции и роли, без таблицы.
5. Ошибка `schema "public" already exists` при restore — безвредная, `pg_dump` кладёт
   `CREATE SCHEMA public` в дамп.

**Что репетиция ещё не покрыла:** реальный вход через GoTrue по паролю (нужен стек,
смотрящий на эту базу), Realtime, Edge Functions и работу UI. Это Фаза 5 на самом сервере.

Базу-репетицию можно удалить: `drop database crm_rehearsal;`

---

## Приложение А. Генерация anon и service_role ключей

Ключи Supabase — обычные JWT, подписанные вашим `JWT_SECRET`, с claim `role`.
PostgREST достаёт из токена `role` и работает от этой роли в Postgres.

```js
// genkey.mjs — node genkey.mjs "<JWT_SECRET>" anon
import crypto from "node:crypto";

const [secret, role] = process.argv.slice(2);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const iat = Math.floor(Date.now() / 1000);
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role, iss: "supabase", iat, exp: iat + 60 * 60 * 24 * 365 * 10 });
const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
```

- `anon` — идёт во фронт (`VITE_SUPABASE_ANON_KEY`), публичный по своей природе.
- `service_role` — **только** на сервере (Edge Functions, скрипты). Во фронт не попадает никогда.
- `JWT_SECRET` должен быть не короче 32 символов, одинаковый для PostgREST, GoTrue и Realtime.

## Приложение Б. Внешний nginx для API

```nginx
server {
    listen 443 ssl http2;
    server_name api.crm-v175.ru;

    ssl_certificate     /etc/letsencrypt/live/api.crm-v175.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.crm-v175.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:54321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Realtime (WebSocket)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 86400s;
    }
}
```

Нужен `map` для `$connection_upgrade` в `http`-блоке:

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
```

Альтернатива поддомену — отдать API тем же `crm-v175.ru` по пути `/supabase/`
(во фронте уже есть поддержка `VITE_SUPABASE_PROXY_URL`): не нужен второй сертификат и нет CORS вообще.
