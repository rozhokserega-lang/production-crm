# Отчёт Smoke-тестирования (ручной) — 2026-04-16

Окружение: `http://164.215.97.254/`  
Роль во время прогона: `admin`  
Strict mode: переключен `ON -> OFF -> ON` и восстановлен в `ON`

## Результаты сценариев

1. **Ручное добавление план-ячейки** — `PASS`
   - Создана новая строка плана отгрузки через `Отгрузка -> Добавить план` с неделей `72`, количеством `1`.
   - Подтверждение: изменились счётчики (`Заказов 2 -> 3`, `Кол-во 72 -> 73`), новая строка появилась в таблице отгрузки.

2. **Отправка в работу** — `PASS`
   - Выбрана созданная строка и выполнено действие `Отправить в работу (1)`.
   - Подтверждение: счётчик `К отправке в работу` стал `0`, `Отправлено в цех` увеличилось до `3`.

3. **Завершение этапа** — `PASS`
   - В `Производство -> Кромка` нажата кнопка `Готово` для одного заказа.
   - Подтверждение: количество элементов уменьшилось (`Всего 2 -> 1`), есть соответствующие audit-события `set_stage`.

4. **Списание листов (consume sheets)** — `PARTIAL`
   - Прямой SQL-вызов `web_consume_sheets_by_order_id` через MCP блокируется ролью БД (`viewer` в MCP-контексте).
   - В текущем состоянии UI нет отдельной кнопки для явного consume-флоу.
   - Подтверждение через аудит: события `consume_sheets` присутствуют за последние 24 часа (кол-во `12`) с ролью исполнителя `admin`.

5. **Удаление заказа** — `PASS`
   - В `Статистика` использовано действие строки `X` (удаление).
   - Подтверждение: одна строка удалена из таблицы; в аудите есть `delete_order` для `SP-177B6718`.

6. **Импорт/экспорт и маппинг** — `PARTIAL`
   - Полное взаимодействие с импортом файла не автоматизируется в этом прогоне (нативный file picker).
   - Доступность маппинга подтверждена через RPC:
     - `select count(*) from public.web_get_articles_for_import();` -> `175`
     - `select * from public.web_get_section_articles('Stabile') limit 5;` вернуло корректные маппинги article/material.

7. **Роли и strict mode** — `PASS`
   - Роль пользователя `sergey@crm.ru` изменена `operator -> viewer`, затем удалена, затем восстановлена в `operator`.
   - Strict mode переключен `ON -> OFF -> ON`.
   - Подтверждение: в последних audit-записях есть `assign_role`, `remove_role`, `toggle_strict_mode` с ролью исполнителя `admin`.

## SQL-подтверждения из аудита

```sql
select action, entity, count(*) as cnt
from public.crm_audit_log
where created_at > now() - interval '1 day'
group by action, entity
order by max(created_at) desc;
```

Снимок последних результатов:
- `toggle_strict_mode / crm_runtime_settings`: `4`
- `remove_role / crm_user_roles`: `1`
- `assign_role / crm_user_roles`: `2`
- `delete_order / orders`: `11`
- `set_stage / orders`: `31`
- `consume_sheets / materials_moves`: `12`

```sql
select created_at, action, entity, entity_id, actor_crm_role
from public.crm_audit_log
order by id desc
limit 20;
```

Последние строки включают:
- `toggle_strict_mode` (`admin`)
- `remove_role` (`admin`)
- `assign_role` (`admin`)
- `delete_order` for `SP-177B6718` (`admin`)
- `set_stage` for `SP-7A79B043` (`admin`)
- `consume_sheets` (`admin`)

## Финальный статус

- Прогон завершён с сильными подтверждениями по критичным write-флоу (`создание плана`, `отправка в работу`, `set stage`, `удаление`, `роли + strict mode`).
- Два сценария отмечены как partial из-за ограничений инструмента/контекста:
  - отдельное выполнение consume-действия в текущем UI-состоянии,
  - автоматизация импорта через нативный file picker.
