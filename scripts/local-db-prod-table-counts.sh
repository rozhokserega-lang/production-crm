#!/usr/bin/env bash
set -e
: "${PGHOST:?PGHOST}"
: "${PGPORT:?PGPORT}"
: "${PGUSER:?PGUSER}"
: "${PGPASSWORD:?PGPASSWORD}"
: "${PGDATABASE:?PGDATABASE}"

export PGPASSWORD PGSSLMODE=require

docker run --rm -i -e PGPASSWORD -e PGSSLMODE=require postgres:17 \
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -At <<'SQL'
CREATE TEMP TABLE IF NOT EXISTS _crm_verify_counts (tbl text PRIMARY KEY, cnt bigint);
TRUNCATE _crm_verify_counts;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1
  LOOP
    EXECUTE format(
      'INSERT INTO _crm_verify_counts VALUES (%L, (SELECT count(*)::bigint FROM public.%I))',
      r.tablename, r.tablename
    );
  END LOOP;
END $$;
SELECT tbl || E'\t' || cnt::text FROM _crm_verify_counts ORDER BY 1;
SQL
