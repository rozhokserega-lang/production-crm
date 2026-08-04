param(
  [Parameter(Mandatory = $true)]
  [string]$DumpPath,
  [switch]$DataOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$composeFile = Join-Path $repoRoot "docker-compose.local-db.yml"

if (-not (Test-Path $DumpPath)) {
  Write-Host "File not found: $DumpPath" -ForegroundColor Red
  exit 1
}

$absDump = (Resolve-Path $DumpPath).Path

Write-Host "[local-db] Restore $absDump into crm-local-postgres..." -ForegroundColor Cyan

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$pgReady = $false
for ($i = 0; $i -lt 90; $i++) {
  $null = & docker exec crm-local-postgres psql -U postgres -d postgres -tAc "select 1" 2>$null
  if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
  Start-Sleep -Seconds 1
}
$ErrorActionPreference = $prevEap
if (-not $pgReady) {
  Write-Host "crm-local-postgres is not ready. Run scripts/local-db-up.ps1 first." -ForegroundColor Red
  exit 1
}

& docker cp $absDump crm-local-postgres:/tmp/crm-restore.dump
if ($LASTEXITCODE -ne 0) { exit 1 }

$pgRestoreArgs = @(
  "pg_restore",
  "-U", "postgres",
  "-d", "postgres",
  "--no-owner",
  "--no-privileges"
)
if ($DataOnly) { $pgRestoreArgs += "--data-only", "--disable-triggers" }
$pgRestoreArgs += "/tmp/crm-restore.dump"

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& docker exec -e PGOPTIONS="-c session_replication_role=replica" crm-local-postgres @pgRestoreArgs
$ec = $LASTEXITCODE
$ErrorActionPreference = $prevEap
& docker exec crm-local-postgres rm -f /tmp/crm-restore.dump | Out-Null

if ($ec -ne 0) {
  Write-Host "[local-db] pg_restore exit $ec (duplicate-object warnings are common)." -ForegroundColor Yellow
} else {
  Write-Host "[local-db] Restore finished." -ForegroundColor Green
}

Write-Host "[local-db] Restarting API..." -ForegroundColor Cyan
docker compose -f $composeFile restart rest auth gateway | Out-Null
