# Отчёт о готовности CRM к релизу (ветка test)

Дата: 2026-04-16  
Ветка: `test`  
Область: release-gate, baseline по безопасности БД, усиление CI

## 1) Снимок подтверждений по release-gate

### 1.1 Проверки Supabase advisors

- `security`: нет `ERROR`; остаются предупреждения уровня `WARN/INFO`
  - `WARN`: `auth_leaked_password_protection` отключён (должен быть включён перед production go-live).
  - `INFO` по `rls_enabled_no_policy` устранены после применения миграции `rls_policy_baseline_for_exposed_tables`.
- `performance`: только `INFO` (`unused_index`), блокеров нет.

### 1.2 SQL smoke-проверки

Выполнены read-only smoke-запросы из `STAGING_GO_LIVE_CHECKLIST.md`.

- Результат smoke по заказам/трудоёмкости:
  - `orders_all_cnt=1`
  - `orders_pilka_cnt=0`
  - `orders_kromka_cnt=1`
  - `orders_pras_cnt=0`
  - `labor_rows_cnt=1`
- Smoke по привилегиям критичных RPC:
  - Все требуемые RPC вернули `anon_exec=true`.
- Frontend RPC smoke-скрипт (`npm run smoke:rpc`) также успешно прошёл для:
  - `web_get_orders_all`
  - `web_get_orders_pilka`
  - `web_get_orders_kromka`
  - `web_get_orders_pras`
  - `web_get_labor_table`

### 1.3 Бизнес smoke

Ручной UI smoke по бизнес-флоу (создание/импорт заказа + переходы этапов + shipment + hybrid-логи) должен быть выполнен QA/ops на staging до релизного cutover.  
Источник чеклиста: `SMOKE_REGRESSION_CHECKLIST.md`.

## 2) Реализованные усиливающие изменения

- Конфигурация runtime теперь валит production-сборку, если `VITE_BACKEND_PROVIDER` не задан явно.
- Добавлен CI workflow для ветки `test` с build и опциональным Supabase RPC smoke.
- Добавлена миграция БД для закрытия `RLS enabled without policy` на открытых таблицах.
- Добавлены явные требования по ежедневному health-check и rollback-drill в операционные документы.

## 3) Решение по релизу

Статус: **условно готово** при выполнении обязательных действий:

1. Включить Supabase Auth leaked password protection.
2. Выполнить полный ручной business smoke и приложить логи/скриншоты в релизный тикет.

## 4) GO / NO-GO

- Решение: **GO (staging -> production) с принятым риском**.
- Основания:
  - Ручной smoke выполнен и зафиксирован в `SMOKE_REPORT_2026-04-16.md`.
  - Проверены критичные флоу: создание плана, send-to-work, завершение этапа, удаление заказа, роли, strict mode.
  - Миграция по усилению безопасности БД применена; `ERROR` в advisor отсутствуют.
- Принятый риск:
  - `auth_leaked_password_protection` остаётся в `WARN` из-за ограничения тарифа (функция недоступна на текущем плане).
  - Сценарии smoke `consume` и `import` помечены как partial из-за ограничений инструмента/контекста, при этом audit-подтверждения соответствующих событий есть.
