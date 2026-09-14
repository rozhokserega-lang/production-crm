#!/bin/bash
# Ежедневный бэкап CRM (SRV01): полный дамп БД postgres (public + auth + служебные realtime)
# + копия на VPS (вне офиса) + ротация 14 дней на обеих сторонах.
#
# Установка на SRV01:
#   1. cp scripts/crm-backup.sh ~/crm-backup.sh && chmod +x
#   2. Нужен SSH-ключ SRV01 -> VPS: scripts/local-db-tunnel.sh (п.1-2) — тот же crm_vps_tunnel.
#   3. Cron: (crontab -l; echo "10 2 * * * $HOME/crm-backup.sh >> $HOME/crm-backup.log 2>&1") | crontab -
#
# Восстановление (проверено 14.09.2026, ноль ошибок):
#   docker run -d --name crm-restore -e POSTGRES_PASSWORD=x postgres:17
#   docker exec crm-restore psql -U postgres -d postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
#   docker cp <файл>.dump crm-restore:/tmp/full.dump
#   docker exec crm-restore pg_restore -U postgres -d postgres --no-owner --no-privileges /tmp/full.dump
#   # проверка: select count(*) from public.orders; select count(*) from auth.users;
set -u
STAMP=$(date +%Y%m%d-%H%M%S)
DIR=/opt/apps/crm-db/backups/daily
VPS="root@164.215.97.254"
KEY="$HOME/.ssh/crm_vps_tunnel"
KEEP=14
LOG="$HOME/crm-backup.log"

log() { echo "$(date -Is) $1" >> "$LOG"; }

mkdir -p "$DIR"
OUT="$DIR/crm-full-$STAMP.dump"

log "dump start"
docker exec crm-local-postgres pg_dump -U postgres -d postgres --format=custom --no-owner --no-privileges -f /tmp/crm-full.dump || { log "FAIL: pg_dump"; exit 1; }
docker cp crm-local-postgres:/tmp/crm-full.dump "$OUT"
docker exec crm-local-postgres rm -f /tmp/crm-full.dump
[ -s "$OUT" ] || { log "FAIL: empty dump"; exit 1; }
chmod 600 "$OUT"

# Проверка читаемости дампа
docker cp "$OUT" crm-local-postgres:/tmp/verify.dump
docker exec crm-local-postgres pg_restore --list /tmp/verify.dump >/dev/null || { log "FAIL: pg_restore --list"; exit 1; }
docker exec crm-local-postgres rm -f /tmp/verify.dump
log "dump ok: $(du -h "$OUT" | cut -f1)"

# Копия на VPS (вне офиса)
if ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "$VPS" "mkdir -p /root/crm-backups" && \
   scp -i "$KEY" -o BatchMode=yes "$OUT" "$VPS:/root/crm-backups/"; then
  log "vps copy ok"
else
  log "WARN: vps copy failed (dump остался локально)"
fi

# Ротация: храним по KEEP последних на каждой стороне
ls -1t "$DIR"/crm-full-*.dump 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ssh -i "$KEY" -o BatchMode=yes "$VPS" "ls -1t /root/crm-backups/crm-full-*.dump 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f" 2>/dev/null
log "done"
