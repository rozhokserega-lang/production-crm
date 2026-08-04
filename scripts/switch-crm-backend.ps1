# ============================================================================
# Switch fronted\.env.local between Cloud and Local DB.
#
#   TO LOCAL (offline, no internet):
#     powershell -ExecutionPolicy Bypass -File scripts\switch-crm-backend.ps1 -Local
#
#   TO CLOUD (normal mode):
#     powershell -ExecutionPolicy Bypass -File scripts\switch-crm-backend.ps1 -Cloud
#
# Keeps SUPABASE_DB_URL / SUPABASE_DB_DIRECT_URL (pg_dump credentials),
# only changes VITE_* frontend variables.
# ============================================================================

param(
  [switch]$Local,
  [switch]$Cloud
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontedDir = Join-Path $repoRoot "fronted"
$envFile = Join-Path $frontedDir ".env.local"
$localExample = Join-Path $frontedDir ".env.local-db.example"
$cloudBackup = Join-Path $frontedDir ".env.local.cloud.bak"

if (-not $Local -and -not $Cloud) {
  Write-Host "Usage: switch-crm-backend.ps1 -Local | -Cloud" -ForegroundColor Red
  exit 1
}
if ($Local -and $Cloud) {
  Write-Host "Choose one: -Local OR -Cloud." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Host "[switch] ERROR: $envFile not found." -ForegroundColor Red
  exit 1
}

# ---- Extract pg_dump credentials (keep them in both modes) ----
$dbLines = @()
foreach ($line in Get-Content $envFile) {
  if ($line -match "^\s*(SUPABASE_DB_URL|SUPABASE_DB_DIRECT_URL)\s*=") {
    $dbLines += $line
  }
}
if ($dbLines.Count -eq 0) {
  foreach ($line in Get-Content $localExample) {
    if ($line -match "^\s*(SUPABASE_DB_URL|SUPABASE_DB_DIRECT_URL)\s*=") {
      $dbLines += $line
    }
  }
}

function Read-EnvValue([string]$File, [string]$Key) {
  foreach ($line in Get-Content $File) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Write-EnvFile([string[]]$Lines) {
  Set-Content -LiteralPath $envFile -Value $Lines -Encoding UTF8
  Write-Host "[switch] Written: $envFile" -ForegroundColor Green
}

if ($Cloud) {
  if (-not (Test-Path -LiteralPath $cloudBackup)) {
    Write-Host "[switch] ERROR: cloud backup not found: $cloudBackup" -ForegroundColor Red
    Write-Host "[switch] Run -Local first, or restore .env.local manually." -ForegroundColor Yellow
    exit 1
  }
  Copy-Item -LiteralPath $cloudBackup -Destination $envFile -Force
  Write-Host "[switch] Restored cloud config from $cloudBackup" -ForegroundColor Green
  Write-Host "[switch] Mode: CLOUD (Supabase Cloud)" -ForegroundColor Cyan
  exit 0
}

# ---- LOCAL mode ----
# 1) Backup current cloud config (if not already backed up)
if (-not (Test-Path -LiteralPath $cloudBackup)) {
  Copy-Item -LiteralPath $envFile -Destination $cloudBackup -Force
  Write-Host "[switch] Cloud config backed up -> $cloudBackup" -ForegroundColor Yellow
}

# 2) Build .env.local for local API
$localUrl = Read-EnvValue $localExample "VITE_SUPABASE_URL"
$localAnon = Read-EnvValue $localExample "VITE_SUPABASE_ANON_KEY"
if (-not $localUrl) { $localUrl = "http://127.0.0.1:54321" }
if (-not $localAnon) {
  Write-Host "[switch] ERROR: no local anon key in $localExample" -ForegroundColor Red
  exit 1
}

$lines = @(
  "VITE_BACKEND_PROVIDER=supabase",
  "VITE_SUPABASE_URL=$localUrl",
  "VITE_SUPABASE_DIRECT_URL=$localUrl",
  "VITE_SUPABASE_PROXY_URL=",
  "VITE_SUPABASE_ANON_KEY=$localAnon",
  ""
)

# Append pg_dump credentials
$lines += $dbLines

# Append local-mode comment
$lines += @(
  "",
  "# Local (offline) mode. To switch back to cloud:",
  "#   powershell -ExecutionPolicy Bypass -File scripts\switch-crm-backend.ps1 -Cloud",
  "",
  "# Edge Functions (optional): scripts\local-db-functions-serve.ps1"
)

Write-EnvFile $lines
Write-Host "[switch] Mode: LOCAL (127.0.0.1:54321), offline mode." -ForegroundColor Cyan
Write-Host "[switch] Edge Functions: scripts\local-db-functions-serve.ps1" -ForegroundColor Yellow