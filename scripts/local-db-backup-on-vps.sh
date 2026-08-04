#!/usr/bin/env bash
# pg_dump on VPS. PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE from local-db-fetch-backup-from-vps.ps1
set -eu

OUT="${1:-/tmp/crm-prod-$(date +%Y%m%d-%H%M%S).dump}"
DATA_ONLY="${CRM_DUMP_DATA_ONLY:-0}"

for v in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE; do
  if [ -z "$(eval "echo \${$v:-}")" ]; then
    echo "Missing $v" >&2
    exit 1
  fi
done

extra=""
if [ "$DATA_ONLY" = "1" ]; then extra="--data-only"; fi

echo "[vps-backup] pg_dump $PGHOST:$PGPORT user=$PGUSER -> $OUT" >&2
dump_err="/tmp/crm-pgdump-$$.err"
if docker run --rm \
  -e "PGPASSWORD=$PGPASSWORD" -e PGSSLMODE=require \
  postgres:17 \
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --no-password --format=custom --no-owner --no-privileges --schema=public \
  $extra \
  > "$OUT" 2>"$dump_err"; then
  size=$(wc -c < "$OUT" | tr -d ' ')
  if [ "$size" -gt 0 ]; then
    rm -f "$dump_err"
    echo "[vps-backup] OK ($size bytes)" >&2
    echo "$OUT"
    exit 0
  fi
fi
cat "$dump_err" >&2 2>/dev/null || true
rm -f "$dump_err" "$OUT"
echo "[vps-backup] failed or empty dump" >&2
exit 1
