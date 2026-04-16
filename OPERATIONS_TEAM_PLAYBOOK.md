# Operations Team Playbook (P2)

## Roles

- **Admin**: manages strict mode, role assignments, release approval.
- **Manager**: manages production workflow and incident triage.
- **Operator**: executes day-to-day production actions.

## Who does what during failure

- **Operator**
  - reports failing order id/action and timestamp,
  - stops repeating the same operation.
- **Manager**
  - validates impact scope,
  - checks latest RPC logs and audit rows,
  - escalates to admin if role/strict mode issue.
- **Admin**
  - verifies role matrix and strict-mode status,
  - decides release rollback,
  - executes restore runbook when needed.

## Strict mode operations

Before enabling strict mode:
1. Ensure at least one authenticated admin exists in `crm_user_roles`.
2. Verify login works for admin account.
3. Confirm fallback anon flow is no longer needed.

## Restore launch checklist

1. Open `RUNBOOK_BACKUP_RESTORE.md`.
2. Assign owner for restore and owner for verification.
3. Execute restore drill checks.
4. Reopen traffic only after smoke checks pass.
