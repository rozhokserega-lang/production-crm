#!/bin/bash
# Обратный SSH-туннель: сервер локальной БД (SRV01) -> VPS.
# VPS nginx проксирует /supabase/ на 127.0.0.1:15432, сюда трафик приходит по туннелю
# и уходит в локальный шлюз CRM (127.0.0.1:54321).
#
# Установка на SRV01:
#   1. ssh-keygen -t ed25519 -f ~/.ssh/crm_vps_tunnel -N "" -C "crm-tunnel-srv01"
#   2. Добавить ~/.ssh/crm_vps_tunnel.pub в /root/.ssh/authorized_keys на VPS.
#   3. Скопировать этот файл в ~/crm-tunnel.sh и chmod +x.
#   4. Автозапуск: (crontab -l; echo "@reboot $HOME/crm-tunnel.sh") | crontab -
#
# Петля сама переподнимает туннель при обрыве сети/перезапуске sshd на VPS.
VPS="root@164.215.97.254"
KEY="${CRM_TUNNEL_KEY:-$HOME/.ssh/crm_vps_tunnel}"
LOG="${CRM_TUNNEL_LOG:-$HOME/crm-tunnel.log}"

echo "$(date -Is) tunnel loop started" >> "$LOG"
while true; do
  ssh -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes \
      -o ConnectTimeout=15 \
      -i "$KEY" \
      -N -T -R 127.0.0.1:15432:127.0.0.1:54321 "$VPS" >> "$LOG" 2>&1
  echo "$(date -Is) tunnel exited, retry in 10s" >> "$LOG"
  sleep 10
done
