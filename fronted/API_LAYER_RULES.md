# API Layer Rules

## Цель

Сделать доступ к RPC предсказуемым и проверяемым: UI-слой не должен ходить в `callBackend` напрямую.

## Правило

- `views/*` и `components/*` не импортируют `callBackend` из `api.js`.
- Доступ к RPC идёт через сервисный слой: `src/services/orderService.js`.

## Почему

- проще тестировать и мокать API;
- меньше дублирования action-имен и payload-форматов;
- легче контролировать обработку ошибок и ретраи в одном месте.

## Текущее состояние

- В ESLint добавлен guard (`no-restricted-imports`) для `views` и `components`.
- На этой стадии guard включён как `warn`, чтобы миграция была постепенной.

## План ужесточения

1. Перенести существующие прямые вызовы из `views/components` в `OrderService`.
2. Переключить правило ESLint с `warn` на `error`.
