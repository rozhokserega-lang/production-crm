# Fix deployment issue - "Cannot GET /"

## Problem
The application shows "Cannot GET /" error after deployment.

## Root Cause
Vite configuration was missing production settings and proper base path configuration.

## Solution Steps

### 1. Update Vite Configuration (Already Done)
- Added `base: "/"`
- Added production build settings
- Added preview configuration

### 2. Rebuild and Redeploy on VPS
Execute these commands on VPS:

```bash
ssh root@164.215.97.254
cd /opt/apps/production-crm/fronted

# Clean rebuild
rm -rf dist/
npm ci
npm run build

# Check if index.html exists
ls -la dist/

# Restart service
sudo systemctl restart production-crm.service

# Check service status
sudo systemctl status production-crm.service

# Check logs if needed
sudo journalctl -u production-crm.service -f
```

### 3. Alternative: Use Nginx Static Serving
If the service approach doesn't work, configure Nginx:

```bash
# Create Nginx config
sudo tee /etc/nginx/sites-available/crm-test << 'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/crm-test;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/crm-test /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Copy files to web root
sudo cp -r /opt/apps/production-crm/fronted/dist/* /var/www/crm-test/
```

### 4. Verify
After deployment, check:
- http://164.215.97.254
- Browser console for errors
- Network tab for failed requests

## What Was Fixed
- `base: "/"` in Vite config for proper asset paths
- Production build optimization
- Preview server configuration

## Expected Result
Application should load properly with all assets and routes working.
