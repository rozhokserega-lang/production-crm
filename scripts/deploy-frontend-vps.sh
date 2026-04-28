#!/usr/bin/env bash
# Деплой CRM frontend на VPS (staging по умолчанию — ветка test, как в README_DEPLOY_STAGING.md).
#
# Использование на сервере:
#   chmod +x scripts/deploy-frontend-vps.sh
#   ./scripts/deploy-frontend-vps.sh
#
# Переопределение путей и ветки:
#   REPO_DIR=/opt/apps/production-crm GIT_BRANCH=test WEB_ROOT=/var/www/crm-test ./scripts/deploy-frontend-vps.sh
#
# Требования: git, node/npm в PATH; для /var/www обычно нужен root или sudo.

set -euo pipefail

: "${REPO_DIR:=/opt/apps/production-crm}"
: "${GIT_BRANCH:=test}"
: "${GIT_REMOTE:=origin}"
: "${WEB_ROOT:=/var/www/crm-test}"
: "${FRONTEND_REL:=fronted}"
: "${REQUIRE_PROXY:=1}"
: "${EXPECTED_SUPABASE_URL:=https://supabase-proxy.crm-v175.ru}"

need_sudo() {
  local target="$1"
  [[ -e "$target" ]] && [[ ! -w "$target" ]] && return 0
  [[ ! -e "$target" ]] && [[ ! -w "$(dirname "$target")" ]] && return 0
  return 1
}

run_web() {
  if need_sudo "$WEB_ROOT"; then
    sudo "$@"
  else
    "$@"
  fi
}

run_nginx() {
  if [[ "${EUID:-0}" -eq 0 ]]; then
    nginx -t
    systemctl reload nginx
  else
    sudo nginx -t
    sudo systemctl reload nginx
  fi
}

repo_abs="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Если скрипт лежит в клоне не в /opt/apps — по умолчанию деплоим из текущего репозитория.
if [[ -d "$repo_abs/$FRONTEND_REL" ]]; then
  REPO_DIR="$repo_abs"
fi

echo "==> Repo:    $REPO_DIR"
echo "==> Branch:  $GIT_BRANCH"
echo "==> Web root: $WEB_ROOT"
echo "==> Expected Supabase URL: $EXPECTED_SUPABASE_URL (REQUIRE_PROXY=$REQUIRE_PROXY)"

cd "$REPO_DIR"

git fetch "$GIT_REMOTE"
git checkout "$GIT_BRANCH"
git pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH" || git pull "$GIT_REMOTE" "$GIT_BRANCH"

cd "$REPO_DIR/$FRONTEND_REL"

if [[ ! -f .env.production ]]; then
  echo "ERROR: $REPO_DIR/$FRONTEND_REL/.env.production not found."
  exit 1
fi

if [[ "$REQUIRE_PROXY" == "1" ]]; then
  current_url="$(sed -n 's/^VITE_SUPABASE_URL=//p' .env.production | tail -n 1 | tr -d '\r')"
  if [[ -z "$current_url" ]]; then
    echo "ERROR: VITE_SUPABASE_URL is empty in .env.production"
    exit 1
  fi
  if [[ "$current_url" != "$EXPECTED_SUPABASE_URL" ]]; then
    echo "ERROR: VITE_SUPABASE_URL mismatch in .env.production"
    echo "  got:      $current_url"
    echo "  expected: $EXPECTED_SUPABASE_URL"
    exit 1
  fi
fi

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run lint
npm run test:run
npm run build

if [[ "$REQUIRE_PROXY" == "1" ]]; then
  if ! grep -Rqs "$EXPECTED_SUPABASE_URL" dist/assets; then
    echo "ERROR: expected proxy URL not found in dist/assets"
    exit 1
  fi
fi

run_web mkdir -p "$WEB_ROOT"

if command -v rsync >/dev/null 2>&1; then
  run_web rsync -a --delete "$REPO_DIR/$FRONTEND_REL/dist/" "$WEB_ROOT/"
else
  run_web bash -c "shopt -s nullglob; rm -rf \"$WEB_ROOT\"/*"
  run_web cp -a "$REPO_DIR/$FRONTEND_REL/dist/." "$WEB_ROOT/"
fi

if command -v nginx >/dev/null 2>&1; then
  run_nginx
  echo "==> Nginx reloaded."
else
  echo "==> nginx not found; skip reload. Copy done."
fi

echo "==> Deploy finished."
