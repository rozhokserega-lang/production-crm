param(
  [switch]$DataOnly,
  [switch]$SkipRestore
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[local-db] Sync: backup from prod cloud Postgres..." -ForegroundColor Cyan
if ($DataOnly) {
  & (Join-Path $scriptDir "local-db-backup-prod.ps1") -DataOnly
} else {
  & (Join-Path $scriptDir "local-db-backup-prod.ps1")
}
if ($LASTEXITCODE -ne 0) { exit 1 }

if ($SkipRestore) {
  Write-Host "[local-db] SkipRestore: dump saved only." -ForegroundColor Yellow
  exit 0
}

$repoRoot = Split-Path -Parent $scriptDir
$dumpDir = Join-Path $repoRoot "backups/local-db"
$latest = Get-ChildItem $dumpDir -Filter "*.dump" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $latest) {
  Write-Host "[local-db] No dump found in $dumpDir" -ForegroundColor Red
  exit 1
}

Write-Host "[local-db] Ensure local stack is up..." -ForegroundColor Cyan
& (Join-Path $scriptDir "local-db-up.ps1") -SkipInit -NoPull
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[local-db] Restore latest: $($latest.FullName)" -ForegroundColor Cyan
if ($DataOnly) {
  & (Join-Path $scriptDir "local-db-restore.ps1") -DumpPath $latest.FullName -DataOnly
} else {
  & (Join-Path $scriptDir "local-db-restore.ps1") -DumpPath $latest.FullName
}
