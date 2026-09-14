#!/bin/bash
set -euo pipefail
echo "=== env ==="
grep '^VITE_SUPABASE_URL=' /opt/apps/production-crm/fronted/.env.production
echo "=== index ==="
grep -oE 'index-[^" ]+\.js' /var/www/crm-v175/current/index.html | head
echo "=== cloud url in dist ==="
grep -Rcl 'nsdwypcbhmfseotclkrm.supabase.co' /var/www/crm-v175/current/assets | wc -l
echo "=== nginx proxy ==="
grep -n 'proxy_pass\|supabase_upstream' /etc/nginx/sites-enabled/crm-v175.ru
echo "=== api ==="
curl -sS -m 8 -o /dev/null -w 'auth %{http_code}\n' https://crm-v175.ru/supabase/auth/v1/health
