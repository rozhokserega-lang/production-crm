param(
  [string]$OutDir = "",
  [switch]$DataOnly
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontedEnv = Join-Path $repoRoot "fronted/.env.local"

function Read-DbUrl {
  if ($env:SUPABASE_DB_URL) { return $env:SUPABASE_DB_URL.Trim() }
  if (-not (Test-Path $frontedEnv)) {
    Write-Host "Set SUPABASE_DB_URL or add it to fronted/.env.local" -ForegroundColor Red
    exit 1
  }
  foreach ($line in Get-Content $frontedEnv) {
    if ($line -match '^\s*SUPABASE_DB_URL\s*=\s*(.+)\s*$') {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  Write-Host "SUPABASE_DB_URL not found in fronted/.env.local" -ForegroundColor Red
  exit 1
}

if (-not $OutDir) {
  $OutDir = Join-Path $repoRoot "backups/local-db"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir "crm-prod-$stamp.dump"
$dbUrl = Read-DbUrl

Write-Host "[local-db] Backup prod -> $outFile" -ForegroundColor Cyan
Write-Host "[local-db] Reads live Supabase Postgres (load on DB side)." -ForegroundColor DarkGray

$pgArgs = @(
  "run", "--rm",
  "-v", "${OutDir}:/out",
  "postgres:17",
  "pg_dump",
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--schema=public",
  "-f", "/out/crm-prod-$stamp.dump",
  $dbUrl
)
if ($DataOnly) {
  $pgArgs = @(
    "run", "--rm",
    "-v", "${OutDir}:/out",
    "postgres:17",
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    "--data-only",
    "-f", "/out/crm-prod-$stamp.dump",
    $dbUrl
  )
}

& docker @pgArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[local-db] OK: $outFile" -ForegroundColor Green
Write-Host "[local-db] backups/ is gitignored — do not commit dumps." -ForegroundColor DarkGray
