# Backup/Restore Runbook (Staging CRM)

## Scope

Runbook for safe backup + restore verification before releases affecting:
- critical RPCs (`web_delete_order_by_id`, `web_consume_sheets_by_order_id`, stage updates),
- role model (`crm_user_roles`),
- strict mode (`crm_runtime_settings`),
- audit (`crm_audit_log`).

## 1) Pre-backup checks

1. Confirm migration list is up to date.
2. Confirm no `ERROR` in Supabase security advisors.
3. Freeze manual schema edits during backup window.

## 2) Backup procedure

1. In Supabase dashboard: open project -> Database -> Backups.
2. Create on-demand backup named:
   - `staging_pre_release_<YYYYMMDD_HHMM>`.
3. Record metadata:
   - backup id,
   - project ref,
   - UTC timestamp,
   - release candidate commit hash.
4. Attach metadata to release artifact (for example `RELEASE_READINESS_<date>.md`).

## 3) Restore drill (must be tested, not only documented)

1. Restore backup into an isolated environment (branch/temporary project).
2. Execute verification SQL:

```sql
select to_regclass('public.crm_audit_log') is not null as has_audit_table,
       to_regclass('public.crm_user_roles') is not null as has_roles_table,
       to_regclass('public.crm_runtime_settings') is not null as has_runtime_settings;
```

```sql
select to_regprocedure('public.web_get_audit_log(integer,integer,text)') is not null as has_web_get_audit_log,
       to_regprocedure('public.web_set_crm_auth_strict(boolean)') is not null as has_web_set_crm_auth_strict,
       to_regprocedure('public.web_set_crm_user_role(uuid,text,text)') is not null as has_web_set_crm_user_role;
```

```sql
select count(*) as audit_rows from public.crm_audit_log;
```

3. From UI (or SQL), run one action from each class:
   - set stage,
   - consume sheets,
   - toggle strict mode,
   - assign/remove role.
4. Confirm new rows appear in `crm_audit_log` for all actions.
5. Save verification SQL output and smoke result reference into release artifact.

## 4) Roll-forward after restore

1. Re-run pending migrations in order from `supabase/migrations`.
2. Re-check advisors (`security` and `performance`).
3. Re-run smoke checklist (`SMOKE_REGRESSION_CHECKLIST.md`).

## 5) Exit criteria

- Restore environment passes SQL/object checks.
- All 4 action classes produce audit records.
- No advisor `ERROR` after restore.
