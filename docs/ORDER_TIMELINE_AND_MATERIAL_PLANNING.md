# Order Timeline And Material Planning

## Order Timeline

The order drawer now shows an "История заказа" section for users who can manage orders or administer CRM settings.

The timeline is built from `crm_audit_log` through the existing `web_get_audit_log` RPC and includes:

- order creation date from the loaded order row;
- stage changes from `set_stage` audit events;
- sheet consumption from `consume_sheets` audit events;
- failed sheet consumption from `consume_sheets_failed`;
- admin comment updates from `set_order_admin_comment`.

The migration `20260520102000_audit_order_admin_comment.sql` updates `web_set_order_admin_comment` so future comment changes are written to the audit log.

## Material Planning

The warehouse "Что заказать для закрытия плана" block now keeps the previous total deficit calculation and adds:

- the nearest affected week;
- projected deficit by week;
- how many plan rows are blocked by each material;
- a short list of blocking rows with order id when it can be resolved from shipment/order indexes.

The calculation is still derived from the current shipment plan, material stock rows, and frontend filters. It does not introduce a new database table.

## Production Load Forecast

The labor view now has a "Прогноз" tab. It groups labor rows by plan week and shows:

- order count and planned quantity for the week;
- minutes by stage: saw, edge banding, drilling, assembly;
- weekly capacity from the saved work schedule;
- overload/free minutes by stage;
- top orders contributing the most labor.

Edge banding and drilling capacity use the same local station counts as the labor planner. The forecast is calculated in the frontend from existing labor rows and does not add a new database table.

## Material Card

Warehouse material names are now clickable. The material card combines:

- stock rows and the latest stock update;
- demand from the "what to order" plan;
- orders that require the material and orders blocked by it;
- weekly deficits;
- consumption history and 30-day average consumption;
- an estimated days-left value when actual consumption exists.

The card reuses warehouse stock rows, leftover rows, consume history, and the current material planning result.
