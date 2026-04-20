# Smoke/E2E Regression Checklist (P1)

Minimum target: 7 scenarios before release.

## Scenario 1: Manual plan cell
- Create shipment plan cell from UI.
- Expected: cell appears in plan and table refresh succeeds.

## Scenario 2: Send to work
- Trigger `Send to work` from shipment board.
- Expected: order appears in pipeline; stage status updates; no RPC errors.

## Scenario 3: Complete stage
- Mark one stage as done (`pilka`, `kromka`, or `pras`).
- Expected: order state changes and audit gets `set_stage`.

## Scenario 4: Consume sheets
- Run consume sheets action by order id.
- Expected: stock decreases, move appears, audit gets `consume_sheets`.

## Scenario 5: Delete order
- Delete an order by id.
- Expected: dependent records cleaned, UI refresh succeeds, audit gets `delete_order`.

## Scenario 6: Import/export and mapping
- Run article import flow and verify mapped output.
- Expected: no RPC 4xx/5xx, data visible in catalog tables.

## Scenario 7: Roles and strict mode
- Assign a role, remove a role, toggle strict mode.
- Expected: permission behavior matches role; audit gets `assign_role`/`remove_role`/`toggle_strict_mode`.

## Artifact capture

- Save timestamped evidence for each scenario (`passed/failed`, short notes, screenshot/log link).
- Attach final scenario summary to release readiness report.

## Verification queries

```sql
select action, entity, count(*) as cnt
from public.crm_audit_log
where created_at > now() - interval '1 day'
group by action, entity
order by max(created_at) desc;
```

```sql
select created_at, action, entity, entity_id, actor_crm_role
from public.crm_audit_log
order by id desc
limit 50;
```
