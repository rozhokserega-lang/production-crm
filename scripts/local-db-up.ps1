param(
  [switch]$SkipInit,
  [switch]$NoPull,
  [switch]$RestoreLatest,
  [switch]$WithFunctions,
  [switch]$SyncFromProd
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$composeFile = Join-Path $repoRoot "docker-compose.local-db.yml"

function Say([string]$Message) {
  Write-Host "[local-db] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host "[local-db] ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Invoke-Docker {
  param([string[]]$DockerArgs)
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($DockerArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Test-SchemaInitialized {
  $sql = "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='web_get_orders_all' limit 1;"
  $out = & docker exec crm-local-postgres psql -U postgres -d postgres -tAc $sql 2>$null
  return ($LASTEXITCODE -eq 0 -and ($out | ForEach-Object { $_.Trim() }) -eq "1")
}

function Test-LocalDbHasOrderRows {
  $out = & docker exec crm-local-postgres psql -U postgres -d postgres -tAc "select count(*)::bigint from public.orders" 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  $n = [int64]0
  [void][int64]::TryParse(($out | Select-Object -First 1).Trim(), [ref]$n)
  return ($n -gt 0)
}

function Get-LatestDumpPath {
  $dumpDir = Join-Path $repoRoot "backups/local-db"
  $latest = Get-ChildItem $dumpDir -Filter "*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latest) { return $latest.FullName }
  return $null
}

function Apply-SqlFile {
  param([string]$Label, [string]$ContainerPath)
  Say "Applying $Label..."
  Invoke-Docker @("exec", "crm-local-postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", $ContainerPath)
}

function Initialize-LocalSchema {
  Say "First start: loading prod schema (auth-shim + BASELINE + migrations, WARN-only)..."
  Invoke-Docker @("exec", "crm-local-postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", "DROP SCHEMA IF EXISTS public CASCADE;") | Out-Null

  Apply-SqlFile "auth-shim" "/work/supabase/migrations/_ci_auth_shim.sql"
  Apply-SqlFile "BASELINE" "/work/supabase/BASELINE.sql"

  Say "Applying migrations (historical drift = warning only)..."
  Get-ChildItem (Join-Path $repoRoot "supabase/migrations") -File -Filter "*.sql" |
    Sort-Object Name |
    ForEach-Object {
      if ($_.Name -like "_ci_*") { return }
      $errOut = & docker exec crm-local-postgres psql -U postgres -d postgres -f "/work/supabase/migrations/$($_.Name)" 2>&1
      $hasError = $false
      foreach ($line in $errOut) {
        if ($line -is [string] -and $line -match "ERROR:") { $hasError = $true; break }
      }
      if ($hasError) {
        Write-Host "  ! $($_.Name) (drift, skipped)" -ForegroundColor Yellow
      }
    }

  Apply-SqlFile "realtime publication" "/work/scripts/local-db/realtime-publication.sql"

  Invoke-Docker @(
    "exec", "crm-local-postgres", "psql", "-U", "postgres", "-d", "postgres", "-c",
    "CREATE TABLE IF NOT EXISTS public.local_db_meta (initialized_at timestamptz NOT NULL DEFAULT now(), note text); INSERT INTO public.local_db_meta (note) VALUES ('schema from BASELINE+migrations');"
  ) | Out-Null

  if (-not (Test-SchemaInitialized)) {
    Fail "Schema init finished but web_get_orders_all RPC is missing."
  }
  Say "Schema ready."
}

function Start-FunctionsServerWindow {
  $serveScript = Join-Path $scriptDir "local-db-functions-serve.ps1"
  if (-not (Test-Path $serveScript)) { return }
  Say "Starting Edge Functions in a new window (port 54322)..."
  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $serveScript
  ) | Out-Null
}

if ($SyncFromProd) {
  Say "SyncFromProd: backup + restore..."
  & (Join-Path $scriptDir "local-db-sync-prod.ps1")
  if ($LASTEXITCODE -ne 0) { exit 1 }
  $RestoreLatest = $false
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker not found. Install Docker Desktop."
}

Set-Location $repoRoot

Say "Starting Postgres..."
Invoke-Docker @("compose", "-f", $composeFile, "up", "-d", "db")

Say "Waiting for Postgres..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  $null = & docker exec crm-local-postgres psql -U postgres -d postgres -tAc "select 1" 2>$null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "Postgres did not become ready." }

if (-not $SkipInit -and -not (Test-SchemaInitialized)) {
  Initialize-LocalSchema
} elseif (Test-SchemaInitialized) {
  Say "Applying realtime publication (idempotent)..."
  Apply-SqlFile "realtime publication" "/work/scripts/local-db/realtime-publication.sql"
}

if ($RestoreLatest) {
  $dump = Get-LatestDumpPath
  if (-not $dump) {
    Fail "RestoreLatest: no .dump in backups/local-db — run local-db-sync-prod.ps1 first."
  }
  Say "RestoreLatest: $dump"
  & (Join-Path $scriptDir "local-db-restore.ps1") -DumpPath $dump
  if ($LASTEXITCODE -ne 0) { Fail "Restore failed." }
}

Say "Starting API (REST, Auth, Realtime, gateway)..."
$upArgs = @("compose", "-f", $composeFile, "up", "-d")
if (-not $NoPull) { $upArgs += "--pull", "missing" }
Invoke-Docker $upArgs

Say "Waiting for API gateway..."
Start-Sleep -Seconds 3

if ($WithFunctions) {
  Start-FunctionsServerWindow
}

if (-not (Test-LocalDbHasOrderRows)) {
  Write-Host "[local-db] WARNING: public.orders is empty — run:" -ForegroundColor Yellow
  Write-Host "         scripts/local-db-sync-prod.ps1   (backup prod + restore)" -ForegroundColor Yellow
  Write-Host "      or scripts/local-db-up.ps1 -RestoreLatest" -ForegroundColor Yellow
} else {
  Say "Data OK: public.orders has rows."
}

Say "Local API:     http://127.0.0.1:54321"
Say "Realtime ws:   ws://127.0.0.1:54321/realtime/v1/websocket"
Say "Edge Functions: scripts/local-db-functions-serve.ps1  (or -WithFunctions)"
Say "Front env:     fronted/.env.local-db.example -> fronted/.env.local"
Say "Done."
