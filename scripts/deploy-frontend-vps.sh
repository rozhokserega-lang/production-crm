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

cd "$REPO_DIR"

git fetch "$GIT_REMOTE"
git checkout "$GIT_BRANCH"
git pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH" || git pull "$GIT_REMOTE" "$GIT_BRANCH"

cd "$REPO_DIR/$FRONTEND_REL"

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run build

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
