$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$composeFile = Join-Path $repoRoot "docker-compose.local-db.yml"
Write-Host "[local-db] Stopping stack (volume crm_local_pgdata is kept)..." -ForegroundColor Cyan
docker compose -f $composeFile down
if ($LASTEXITCODE -ne 0) { exit 1 }
