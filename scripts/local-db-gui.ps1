# CRM Local DB GUI (WinForms). Run with: powershell -STA -File local-db-gui.ps1
# File must be UTF-8 with BOM for Windows PowerShell 5.1 + Cyrillic UI.
param(
  [string]$VpsHost = "",
  [string]$VpsUser = "root"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$dumpDir = Join-Path $repoRoot "backups/local-db"

if (-not $VpsHost) {
  $VpsHost = $env:CRM_VPS_HOST
  if (-not $VpsHost) { $VpsHost = "164.215.97.254" }
}

function Show-Info([string]$Text) {
  [System.Windows.Forms.MessageBox]::Show($Text, "CRM Local DB", "OK", "Information") | Out-Null
}

function Start-CrmConsoleTask([string]$ScriptRelPath, [string[]]$ExtraArgs = @()) {
  $scriptPath = Join-Path $scriptDir $ScriptRelPath
  if (-not (Test-Path $scriptPath)) {
    Show-Info "Ne nayden skript:`n$scriptPath"
    return
  }
  $argList = @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", $scriptPath
  ) + $ExtraArgs
  Start-Process -FilePath "powershell.exe" -ArgumentList $argList -WorkingDirectory $repoRoot | Out-Null
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "CRM - lokalnaya BD"
$form.Size = New-Object System.Drawing.Size(420, 620)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$y = 12
function Add-Label([string]$Text) {
  $lbl = New-Object System.Windows.Forms.Label
  $lbl.Text = $Text
  $lbl.AutoSize = $true
  $lbl.Location = New-Object System.Drawing.Point(16, $script:y)
  $form.Controls.Add($lbl)
  $script:y += 22
}

function Add-Button([string]$Text, [scriptblock]$OnClick, [int]$Height = 32) {
  $btn = New-Object System.Windows.Forms.Button
  $btn.Text = $Text
  $btn.Size = New-Object System.Drawing.Size(376, $Height)
  $btn.Location = New-Object System.Drawing.Point(16, $script:y)
  $btn.Add_Click($OnClick)
  $form.Controls.Add($btn)
  $script:y += ($Height + 8)
}

# UI strings (Cyrillic) - loaded at runtime to avoid source encoding issues
$ui = @{
  title           = "CRM - lokalnaya BD"
  hdrDump         = "Supabase -> damp (VPS: {0}@{1})" -f $VpsUser, $VpsHost
  b1              = "1. Snyat damp s proda (tolko fayl)"
  b2              = "2. Damp + zalit v lokalnuyu BD"
  b3              = "3. Ezhednevnyy bekap"
  hdrDocker       = "Lokalnyy Docker (127.0.0.1:54321)"
  b4              = "4. Podnyat stek (Postgres + API + Realtime)"
  b5              = "5. Stek + Edge Functions"
  b6              = "6. Zalit posledniy damp (data-only)"
  b7              = "7. Ostanovit lokalnyy stek"
  hdrFront        = "Front"
  b8              = "8. Zapustit CRM (localhost:5173)"
  b9              = "9. Otkryt papku dampov"
  b10             = "10. Podskazka: .env dlya oflayna"
  hint            = "Nuzhny: Docker Desktop, SSH na VPS."
  msgDump         = "Otkrylos okno konsoli. Fayl: backups\local-db\crm-prod-vps-*.dump"
  msgDumpRestore  = "Damp s VPS i restore. Dozhdites OK v konsoli."
  msgNoBat        = "Ne nayden Start-CrmLocalDb.bat"
  msgNoDump       = "Net .dump v papke backups. Snachala punkt 1 ili 2."
  msgEnv          = @"
Dlya raboty BEZ Supabase Cloud:

1) copy fronted\.env.local-db.example fronted\.env.local
   (sohranite oblachnyy .env v .env.local.cloud-backup)

2) Punkt 4 ili 5 - podnyat Docker

3) Punkt 8 - front

Primer: fronted\.env.local-db.example
"@
}

$form.Text = "CRM - локальная БД"
$ui.hdrDump = "Supabase -> дамп (VPS: $VpsUser@$VpsHost)"
$ui.b1 = "1. Снять дамп с прода (только файл)"
$ui.b2 = "2. Дамп + залить в локальную БД (data-only)"
$ui.b3 = "3. Ежедневный бэкап (как по расписанию)"
$ui.hdrDocker = "Локальный Docker (127.0.0.1:54321)"
$ui.b4 = "4. Поднять стек (Postgres + API + Realtime)"
$ui.b5 = "5. Стек + Edge Functions (два окна)"
$ui.b6 = "6. Залить последний дамп (data-only)"
$ui.b7 = "7. Остановить локальный стек"
$ui.hdrFront = "Фронт"
$ui.b8 = "8. Запустить CRM (localhost:5173)"
$ui.b9 = "9. Открыть папку дампов"
$ui.b10 = "10. Подсказка: .env для офлайна"
$ui.b11 = "11. Проверить дамп (prod vs local)"
$ui.hint = "Нужны: Docker Desktop, SSH на VPS. Дампы не коммитить."
$ui.msgDump = "Открылось окно консоли. Готовый файл в backups\local-db\"
$ui.msgDumpRestore = "Дамп с VPS и restore в Docker. Дождитесь OK в консоли."
$ui.msgNoBat = "Не найден Start-CrmLocalDb.bat"
$ui.msgNoDump = "Нет .dump в backups\local-db. Сначала пункт 1 или 2."
$ui.msgEnv = @"
Для работы БЕЗ Supabase Cloud (офлайн):

1. Переключить фронтенд на локальную БД:
   powershell -ExecutionPolicy Bypass -File scripts\switch-crm-backend.ps1 -Local
   (сохраняет SUPABASE_DB_URL для будущих дампов)

2. Пункт 4 или 5 - поднять Docker

3. Пункт 8 - фронт

Вернуться на облако:
   powershell -ExecutionPolicy Bypass -File scripts\switch-crm-backend.ps1 -Cloud
"@
$ui.msgVerify = "Сравнение prod / local / файл дампа. Отчёт: backups\local-db\verify-*.txt"

Add-Label $ui.hdrDump

Add-Button $ui.b1 {
  Start-CrmConsoleTask "local-db-fetch-backup-from-vps.ps1" @(
    "-VpsHost", $VpsHost, "-VpsUser", $VpsUser, "-SkipRestore"
  )
  Show-Info $ui.msgDump
}

Add-Button $ui.b2 {
  Start-CrmConsoleTask "local-db-fetch-backup-from-vps.ps1" @(
    "-VpsHost", $VpsHost, "-VpsUser", $VpsUser
  )
  Show-Info $ui.msgDumpRestore
}

Add-Button $ui.b3 {
  Start-CrmConsoleTask "local-db-scheduled-backup.ps1" @()
}

$y += 4
Add-Label $ui.hdrDocker

Add-Button $ui.b4 {
  Start-CrmConsoleTask "local-db-up.ps1" @("-NoPull")
}

Add-Button $ui.b5 {
  $bat = Join-Path $scriptDir "Start-CrmLocalDb.bat"
  if (Test-Path $bat) {
    Start-Process -FilePath $bat -WorkingDirectory $scriptDir
  } else {
    Show-Info $ui.msgNoBat
  }
}

Add-Button $ui.b6 {
  $latest = Get-ChildItem $dumpDir -Filter "*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    Show-Info $ui.msgNoDump
    return
  }
  Start-CrmConsoleTask "local-db-restore.ps1" @(
    "-DumpPath", $latest.FullName, "-DataOnly"
  )
}

Add-Button $ui.b7 {
  Start-CrmConsoleTask "local-db-down.ps1" @()
}

$y += 4
Add-Label $ui.hdrFront

Add-Button $ui.b8 {
  Start-CrmConsoleTask "start-local-dev.ps1" @()
}

Add-Button $ui.b9 {
  New-Item -ItemType Directory -Force -Path $dumpDir | Out-Null
  Start-Process explorer.exe $dumpDir
}

Add-Button $ui.b10 {
  Show-Info $ui.msgEnv
}

Add-Button $ui.b11 {
  Start-CrmConsoleTask "local-db-verify-dump.ps1" @("-VpsHost", $VpsHost, "-VpsUser", $VpsUser)
  Show-Info $ui.msgVerify
}

$hint = New-Object System.Windows.Forms.Label
$hint.Text = $ui.hint
$hint.AutoSize = $false
$hint.Size = New-Object System.Drawing.Size(376, 36)
$hint.Location = New-Object System.Drawing.Point(16, $y)
$form.Controls.Add($hint)

[void]$form.ShowDialog()
