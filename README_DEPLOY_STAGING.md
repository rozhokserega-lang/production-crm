# Staging Deploy Runbook (VPS)

This runbook documents the exact setup currently used to run the CRM staging frontend on a VPS.

## Current Environment

- Server OS: Ubuntu 24.04
- Staging branch: `test`
- Repo path on server: `/opt/apps/production-crm`
- Frontend path on server: `/opt/apps/production-crm/fronted`
- Nginx web root: `/var/www/crm-test`
- Public endpoint: `http://164.215.97.254`

## One-Time Server Setup

Install dependencies:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Clone repository and checkout staging:

```bash
mkdir -p /opt/apps
cd /opt/apps
git clone https://github.com/rozhokserega-lang/production-crm.git
cd /opt/apps/production-crm
git checkout test
```

Create environment file:

```bash
cat > /opt/apps/production-crm/fronted/.env.production << 'EOF'
VITE_BACKEND_PROVIDER=supabase
VITE_SUPABASE_URL=https://nsdwypcbhmfseotclkrm.supabase.co
VITE_SUPABASE_ANON_KEY=REPLACE_WITH_REAL_PUBLISHABLE_KEY
EOF
```

Build frontend:

```bash
cd /opt/apps/production-crm/fronted
npm ci
npm run build
```

Publish static build:

```bash
mkdir -p /var/www/crm-test
rm -rf /var/www/crm-test/*
cp -r /opt/apps/production-crm/fronted/dist/* /var/www/crm-test/
```

Configure Nginx:

```bash
cat > /etc/nginx/sites-available/crm-test << 'EOF'
server {
    listen 80;
    server_name 164.215.97.254;

    root /var/www/crm-test;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/crm-test /etc/nginx/sites-enabled/crm-test
nginx -t
systemctl enable nginx
systemctl restart nginx
```

## Staging Update Procedure (After New Commits)

```bash
cd /opt/apps/production-crm
git fetch origin
git checkout test
git pull origin test

cd /opt/apps/production-crm/fronted
npm ci
npm run build

rm -rf /var/www/crm-test/*
cp -r dist/* /var/www/crm-test/
systemctl reload nginx
```

## Quick Troubleshooting

- `Invalid API key`:
  - Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are from the same Supabase project.
- Frontend loads but data empty:
  - Re-check `.env.production`, rebuild, copy `dist`, reload nginx.
- Nginx issues:
  - `nginx -t`
  - `systemctl status nginx --no-pager -l`

