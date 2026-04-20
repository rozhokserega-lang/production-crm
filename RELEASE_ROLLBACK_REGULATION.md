# Release/Rollback Regulation (P2)

## Release order

1. Apply DB migrations on staging.
2. Verify advisors (`security`, `performance`) and smoke checklist.
3. Build frontend and deploy.
4. Monitor RPC errors and hybrid duplicate logs for 30-60 minutes.

## Release gate (must pass)

- `security advisors`: zero `ERROR`.
- Supabase Auth leaked password protection: `enabled`.
- critical RPCs callable with expected roles.
- smoke checklist passed.
- audit log captures all critical events.

## Rollback conditions

Rollback is required if at least one of these happens:
- repeatable RPC failures on critical flow (`set stage`, `consume`, `delete`),
- permission regression blocking operators/managers,
- data inconsistency detected after release.

## Rollback sequence

1. Stop new writes (temporary maintenance mode or operator freeze).
2. Roll back frontend to previous artifact.
3. Restore database from latest valid backup snapshot.
4. Re-apply safe migrations only if required for compatibility.
5. Validate with smoke checklist and audit checks.

## Post-rollback report

Capture:
- incident start/end UTC,
- affected actions and users,
- recovery path used,
- preventive action for next release.

## Rollback drill cadence

- Minimum cadence: once per release candidate before production go-live.
- Drill evidence must include:
  - backup id,
  - restore target environment,
  - SQL/object verification output,
  - smoke regression result reference.
