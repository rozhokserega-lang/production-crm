#!/bin/bash
set -euo pipefail
echo "=== index ==="
grep -oE 'index-[^" ]+\.js' /var/www/crm-v175/current/index.html | head
echo "=== url in dist count ==="
grep -Rcl 'crm-v175.ru/supabase' /var/www/crm-v175/current/assets | wc -l
echo "=== cloud leftover ==="
grep -Rcl 'nsdwypcbhmfseotclkrm' /var/www/crm-v175/current/assets || echo none
echo "=== public api ==="
curl -sS -m 8 -o /dev/null -w 'auth %{http_code}\n' https://crm-v175.ru/supabase/auth/v1/health
curl -sS -m 8 https://crm-v175.ru/supabase/; echo
echo "=== tunnel port ==="
ss -lnt | grep 15432 || echo TUNNEL DOWN
