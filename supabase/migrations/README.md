# Supabase Migrations Discipline

This directory is the single source of truth for database changes.

## Rules

1. Every DB change must be a new timestamped SQL file:
   - `YYYYMMDDHHMMSS_descriptive_name.sql`
2. Never edit an already applied migration.
3. Keep migration names aligned with applied DB migration names when possible.
4. All SQL files from `migration/` are considered legacy input and must be tracked in `MIGRATION_BACKFILL_PLAN.md` until migrated here.
5. Apply changes to database only from this directory after review.

## Safe rollout policy

1. Prepare migration in this folder.
2. Review SQL and run checks in staging.
3. Apply in staging.
4. Verify RPC/table/permission state.
5. Apply in production.

## Current status

- Legacy SQL exists in `migration/`.
- Backfill mapping plan is documented in `supabase/migrations/MIGRATION_BACKFILL_PLAN.md`.
- No runtime behavior changes are introduced by this documentation commit.
