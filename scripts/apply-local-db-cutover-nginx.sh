#!/usr/bin/env bash
# Apply /supabase/ proxy cutover: cloud → SSH tunnel to SRV01 (127.0.0.1:15432).
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/crm-nginx-backup-${STAMP}"
mkdir -p "$BACKUP_DIR"

SITE_SRC="/etc/nginx/sites-enabled/crm-v175.ru"
PROXY_SRC="/etc/nginx/sites-enabled/supabase-proxy"
if [[ -L "$SITE_SRC" ]]; then SITE_SRC="$(readlink -f "$SITE_SRC")"; fi
if [[ -L "$PROXY_SRC" ]]; then PROXY_SRC="$(readlink -f "$PROXY_SRC")"; fi

cp -a "$SITE_SRC" "$BACKUP_DIR/crm-v175.ru"
cp -a "$PROXY_SRC" "$BACKUP_DIR/supabase-proxy"
echo "Backed up nginx to $BACKUP_DIR"

cat > /etc/nginx/conf.d/upgrade-map.conf << 'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

cat > "$SITE_SRC" << 'EOF'
server {
    listen 80;
    server_name crm-v175.ru www.crm-v175.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name crm-v175.ru www.crm-v175.ru;

    ssl_certificate /etc/letsencrypt/live/crm-v175.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm-v175.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/crm-v175/current;
    index index.html;

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # Telegram relay: офис (SRV01) не достаёт api.telegram.org напрямую,
    # edge-функции ходят через этот путь (TELEGRAM_API_BASE).
    location /tg-relay/ {
        proxy_pass https://api.telegram.org/;
        proxy_ssl_server_name on;
        proxy_set_header Host api.telegram.org;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 45s;
    }

    location /supabase/ {
        rewrite ^/supabase/?(.*)$ /$1 break;
        # Важно: завершающий слэш в proxy_pass обязателен — без него nginx
        # передаёт оригинальный URI (/supabase/...), игнорируя rewrite выше.
        proxy_pass http://127.0.0.1:15432/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 86400s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

cat > "$PROXY_SRC" << 'EOF'
server {
    listen 80;
    server_name supabase-proxy.crm-v175.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name supabase-proxy.crm-v175.ru;

    ssl_certificate     /etc/letsencrypt/live/supabase-proxy.crm-v175.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supabase-proxy.crm-v175.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        # Завершающий слэш обязателен (см. комментарий в блоке /supabase/ выше).
        proxy_pass http://127.0.0.1:15432/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 86400s;
    }
}
EOF

nginx -t
systemctl reload nginx
echo "nginx reloaded"
curl -sS -m 8 -o /tmp/crm-api-health.json -w 'https://crm-v175.ru/supabase/ HTTP %{http_code}\n' https://127.0.0.1/supabase/ --resolve crm-v175.ru:443:127.0.0.1 -k
cat /tmp/crm-api-health.json; echo
