#!/bin/bash
# Здоровье сервера → push-мониторы Uptime Kuma (диск / нагрузка / память).
# Раз в минуту (cron) шлёт heartbeat: при превышении порога — status=down.
#
# Установка на SRV01:
#   1. В Uptime Kuma создать три монитора типа Push и скопировать их push URL.
#   2. Вписать токены ниже (из /api/push/<токен>).
#   3. cp scripts/crm-health.sh ~/crm-health.sh && chmod +x
#   4. (crontab -l; echo "* * * * * $HOME/crm-health.sh") | crontab -
K="http://127.0.0.1:3001"
DISK_TOKEN=""
LOAD_TOKEN=""
MEM_TOKEN=""

push() { curl -G -sS -m 6 "$K/api/push/$1" --data-urlencode "status=$2" --data-urlencode "msg=$3" -o /dev/null; }

# Диск: корень / заполнен
pct=$(df -P / | awk "NR==2 {gsub(/%/,\"\",\$5); print \$5}")
if [ "$pct" -ge 90 ]; then
  push "$DISK_TOKEN" down "Диск заполнен на ${pct}%"
else
  push "$DISK_TOKEN" up "Диск занят на ${pct}%"
fi

# Нагрузка: load average против числа ядер
n=$(nproc)
load=$(awk "{print \$1}" /proc/loadavg)
high=$(awk -v l="$load" -v n="$n" "BEGIN{print (l > n) ? 1 : 0}")
if [ "$high" -eq 1 ]; then
  push "$LOAD_TOKEN" down "Load ${load} при ${n} ядрах"
else
  push "$LOAD_TOKEN" up "Load ${load} (ядер: ${n})"
fi

# Память: свободно меньше 300 МБ
avail=$(awk "/MemAvailable/ {print int(\$2/1024)}" /proc/meminfo)
if [ "$avail" -lt 300 ]; then
  push "$MEM_TOKEN" down "Свободно ${avail} МБ"
else
  push "$MEM_TOKEN" up "Свободно ${avail} МБ"
fi
