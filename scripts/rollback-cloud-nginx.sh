#!/usr/bin/env bash
set -euo pipefail
BACKUP=/root/crm-nginx-backup-20260914-074459

SITE_DST=/etc/nginx/sites-enabled/crm-v175.ru
PROXY_DST=/etc/nginx/sites-enabled/supabase-proxy
if [[ -L "$SITE_DST" ]]; then SITE_DST="$(readlink -f "$SITE_DST")"; fi
if [[ -L "$PROXY_DST" ]]; then PROXY_DST="$(readlink -f "$PROXY_DST")"; fi

cp -a "$BACKUP/crm-v175.ru" "$SITE_DST"
cp -a "$BACKUP/supabase-proxy" "$PROXY_DST"

cp -a /opt/apps/production-crm/fronted/.env.production.cloud.bak /opt/apps/production-crm/fronted/.env.production
chmod 600 /opt/apps/production-crm/fronted/.env.production

nginx -t
systemctl reload nginx
echo "nginx restored to cloud"
curl -sS -m 8 -o /dev/null -w 'auth-health %{http_code}\n' https://crm-v175.ru/supabase/auth/v1/health
grep '^VITE_SUPABASE_URL=' /opt/apps/production-crm/fronted/.env.production
